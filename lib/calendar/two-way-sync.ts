// Module 4 (scheduling_v2, D-120) — two-way CalDAV sync orchestration.
// Mirrors the shape of feed-sync.ts (fetch/parse/write, never throws,
// records outcome on the owning row) but in both directions:
//   pull:  remote CalDAV resources -> calendar_events rows (external_source-tagged, like an ICS feed import)
//   push:  LifeOS-native calendar_events rows -> CalDAV resources (round-trip identity tracked on the event row)
// Kept as its own module rather than folded into feed-sync.ts because the
// two directions have genuinely different write targets and failure modes,
// even though they share the underlying parse/format primitives.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarEventInsert, CalendarEventRow, CalendarSyncAccountRow } from "../db/database.types";
import {
  listEditedSyncedEventsForAccount,
  listEventsSyncedToAccount,
  listUnsyncedLocalEventsForHousehold,
  replaceImportedEventsForFeed,
  calendarEventsRepo,
} from "../db/repositories/calendar";
import { calendarSyncAccountsRepo } from "../db/repositories/scheduling";
import { buildIcsEventDocument } from "./ics-export";
import { IMPORT_WINDOW_DAYS, parseIcsFeed } from "./ics-import";
import { adapterForAccount, ProviderNotReadyError } from "./sync-providers";

export interface SyncAccountResult {
  ok: boolean;
  count: number;
  error: string | null;
  /** True when the account was skipped as a known-unsupported provider (e.g. google pre-QUEUE-015) rather than a real failure -- callers shouldn't surface this as an error. */
  skipped: boolean;
}

/** The external_source tag every pulled-from-this-account calendar_events row shares -- same role as ics-import's externalSourceForFeed, scoped to a sync account instead of a one-way feed. */
export function externalSourceForSyncAccount(accountId: string): string {
  return `caldav:${accountId}`;
}

function skippedResult(): SyncAccountResult {
  return { ok: true, count: 0, error: null, skipped: true };
}

/**
 * Pull: list every remote resource, skip any that are actually events we
 * ourselves pushed there (identified by href against every LifeOS-native
 * event already round-tripped to this account) to avoid re-importing our
 * own pushed events as a second, external-tagged duplicate, then
 * replace-write the rest as external_source-tagged calendar_events rows.
 */
export async function pullFromSyncAccount(
  client: SupabaseClient,
  account: CalendarSyncAccountRow
): Promise<SyncAccountResult> {
  const adapter = adapterForAccount(account);
  if (!adapter.isReady(account)) {
    if (account.provider === "google") return skippedResult(); // TODO(QUEUE-015): unimplemented, not a failure
    return recordPullOutcome(client, account, { ok: false, count: 0, error: "Missing or invalid calendar credentials.", skipped: false });
  }

  let remoteEvents;
  try {
    remoteEvents = await adapter.listRemoteEvents(account);
  } catch (error) {
    return recordPullOutcome(client, account, { ok: false, count: 0, error: describeError(error), skipped: false });
  }

  let pushedHrefs: Set<string>;
  try {
    const pushedRows = await listEventsSyncedToAccount(client, account.id);
    pushedHrefs = new Set(pushedRows.map((row) => row.external_caldav_href).filter((href): href is string => Boolean(href)));
  } catch (error) {
    return recordPullOutcome(client, account, { ok: false, count: 0, error: describeError(error), skipped: false });
  }

  const remoteOnly = remoteEvents.filter((remote) => !pushedHrefs.has(remote.href));

  // Wide window: individual CalDAV resources aren't pre-filtered by date the
  // way a bulk ICS feed export is, so unlike feed-sync.ts's rolling
  // IMPORT_WINDOW_DAYS window, pull takes whatever the remote calendar
  // actually has -- a person's real calendar is not adversarially huge.
  const windowStart = new Date(Date.UTC(1970, 0, 1));
  const windowEnd = new Date(Date.UTC(2100, 0, 1));
  const externalSource = externalSourceForSyncAccount(account.id);

  const freshEvents: CalendarEventInsert[] = [];
  for (const remote of remoteOnly) {
    let occurrences;
    try {
      occurrences = parseIcsFeed(remote.icsText, windowStart, windowEnd);
    } catch {
      continue; // one malformed remote resource shouldn't fail the whole pull, same posture as feed-sync's per-feed isolation
    }
    for (const occ of occurrences) {
      freshEvents.push({
        household_id: account.household_id,
        created_by_person_id: account.created_by_person_id,
        title: occ.title,
        starts_at: occ.startsAt.toISOString(),
        ends_at: occ.endsAt.toISOString(),
        all_day: occ.allDay,
        event_type: "external",
        visibility: "household",
        external_source: externalSource,
        external_id: `${remote.href}:${occ.externalId}`,
        external_caldav_href: remote.href,
        external_caldav_etag: remote.etag,
      });
    }
  }

  try {
    const imported = await replaceImportedEventsForFeed(client, account.household_id, externalSource, freshEvents);
    return recordPullOutcome(client, account, { ok: true, count: imported, error: null, skipped: false });
  } catch (error) {
    return recordPullOutcome(client, account, { ok: false, count: 0, error: describeError(error), skipped: false });
  }
}

/**
 * Push: LifeOS-native events not yet synced anywhere, plus (D-166 /
 * QUEUE-017) already-synced events edited since their last push.
 *
 * QUEUE-017 resolution: Richard chose blind last-write-wins -- an edited,
 * already-synced event is re-pushed with `etag: null`, which makes
 * putCalendarResource send `If-Match: *` instead of the last known etag,
 * i.e. "overwrite whatever's on the remote calendar right now" rather than
 * "only if it hasn't changed remotely since we last saw it." No
 * conflict-detection UI, per Richard's explicit choice. Local deletes are
 * still not propagated by this function -- that remains QUEUE-018's
 * separate propagateDeleteToRemote hook, called from the delete action
 * itself, unaffected by this change.
 */
export async function pushToSyncAccount(
  client: SupabaseClient,
  account: CalendarSyncAccountRow
): Promise<SyncAccountResult> {
  if (account.sync_direction !== "two_way") return skippedResult();

  const adapter = adapterForAccount(account);
  if (!adapter.isReady(account)) {
    if (account.provider === "google") return skippedResult();
    return recordPushOutcome(client, account, { ok: false, count: 0, error: "Missing or invalid calendar credentials.", skipped: false });
  }

  const windowEnd = new Date(Date.now() + IMPORT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  let newCandidates;
  let editedCandidates;
  try {
    [newCandidates, editedCandidates] = await Promise.all([
      listUnsyncedLocalEventsForHousehold(client, account.household_id, windowEnd.toISOString()),
      listEditedSyncedEventsForAccount(client, account.id, windowEnd.toISOString()),
    ]);
  } catch (error) {
    return recordPushOutcome(client, account, { ok: false, count: 0, error: describeError(error), skipped: false });
  }

  let pushedCount = 0;
  const errors: string[] = [];

  for (const event of newCandidates) {
    try {
      const icsText = buildIcsEventDocument(event);
      const ref = await adapter.pushEvent(account, icsText, null);
      await calendarEventsRepo.update(client, event.id, {
        synced_to_account_id: account.id,
        external_caldav_href: ref.href,
        external_caldav_etag: ref.etag,
        synced_at: new Date().toISOString(),
      });
      pushedCount += 1;
    } catch (error) {
      // One event failing to push (e.g. a transient 5xx) shouldn't block the rest -- same per-item isolation as feed-sync/gift-scan crons.
      errors.push(`${event.id}: ${describeError(error)}`);
    }
  }

  for (const event of editedCandidates) {
    if (!event.external_caldav_href) {
      // Should not happen (an event only reaches "already synced" via the push loop above, which always records a href) but guard defensively rather than sending a pushEvent call that would create a duplicate resource.
      errors.push(`${event.id}: previously-synced event has no known remote href to update.`);
      continue;
    }
    try {
      const icsText = buildIcsEventDocument(event);
      const ref = await adapter.pushEvent(account, icsText, { href: event.external_caldav_href, etag: null });
      await calendarEventsRepo.update(client, event.id, {
        external_caldav_href: ref.href,
        external_caldav_etag: ref.etag,
        synced_at: new Date().toISOString(),
      });
      pushedCount += 1;
    } catch (error) {
      errors.push(`${event.id}: ${describeError(error)}`);
    }
  }

  return recordPushOutcome(client, account, {
    ok: errors.length === 0,
    count: pushedCount,
    error: errors.length > 0 ? errors.join("; ") : null,
    skipped: false,
  });
}

async function recordPullOutcome(
  client: SupabaseClient,
  account: CalendarSyncAccountRow,
  result: SyncAccountResult
): Promise<SyncAccountResult> {
  await calendarSyncAccountsRepo.update(client, account.id, {
    last_pull_at: new Date().toISOString(),
    last_pull_status: result.ok ? "ok" : "error",
    last_pull_error: result.error,
  });
  return result;
}

async function recordPushOutcome(
  client: SupabaseClient,
  account: CalendarSyncAccountRow,
  result: SyncAccountResult
): Promise<SyncAccountResult> {
  await calendarSyncAccountsRepo.update(client, account.id, {
    last_push_at: new Date().toISOString(),
    last_push_status: result.ok ? "ok" : "error",
    last_push_error: result.error,
  });
  return result;
}

function describeError(error: unknown): string {
  if (error instanceof ProviderNotReadyError) return error.message;
  if (error instanceof Error) return error.message || "Unknown calendar sync error.";
  return "Unknown calendar sync error.";
}

/**
 * QUEUE-018: best-effort propagation of a local event delete to whatever
 * CalDAV account it was previously pushed to. Deleting `calendar_events`
 * rows has never had a hook for "also do this side effect on delete" --
 * calling this once at the existing delete call site (deleteCalendarEventAction)
 * is additive and doesn't change the delete flow's shape.
 *
 * Never throws. An orphaned remote copy (the pre-existing v1 behavior, and
 * still the outcome on any failure here) is a strictly safer failure mode
 * than blocking or corrupting a local delete over a remote-calendar error,
 * so every failure path below is swallowed after being attempted once.
 */
export async function propagateDeleteToRemote(
  client: SupabaseClient,
  event: Pick<CalendarEventRow, "synced_to_account_id" | "external_caldav_href" | "external_caldav_etag">
): Promise<void> {
  if (!event.synced_to_account_id || !event.external_caldav_href) return;
  let account: CalendarSyncAccountRow | null;
  try {
    account = await calendarSyncAccountsRepo.getById(client, event.synced_to_account_id);
  } catch {
    return;
  }
  if (!account) return;
  const adapter = adapterForAccount(account);
  if (!adapter.isReady(account)) return;
  try {
    await adapter.deleteRemoteEvent(account, {
      href: event.external_caldav_href,
      etag: event.external_caldav_etag,
    });
  } catch {
    // Best-effort -- see doc comment above.
  }
}
