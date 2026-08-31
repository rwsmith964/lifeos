// P3-6: fetches one household's connected calendar feed over HTTP, parses
// it, and writes the result as ordinary calendar_events rows. Kept
// separate from ics-import.ts (the pure parser) so the parsing logic
// stays unit-testable without a network or a database.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarEventInsert, CalendarFeedRow } from "../db/database.types";
import { calendarFeedsRepo, replaceImportedEventsForFeed } from "../db/repositories/calendar";
import {
  externalSourceForFeed,
  FEED_FETCH_TIMEOUT_MS,
  IMPORT_WINDOW_DAYS,
  isSafeFeedUrl,
  MAX_FEED_BYTES,
  parseIcsFeed,
} from "./ics-import";

export interface FeedSyncResult {
  ok: boolean;
  eventsImported: number;
  error: string | null;
}

/**
 * Fetch, parse, and materialize one calendar feed's occurrences as
 * calendar_events rows, then record the outcome on the feed row itself
 * (last_synced_at/last_sync_status/last_sync_error) so the Settings UI
 * has something to show without a second round trip. Never throws --
 * every failure mode (unsafe URL, network error, oversized response,
 * unparseable ICS, DB write failure) is caught and turned into a
 * recorded `last_sync_status: "error"` plus this function's own
 * `{ ok: false }` result, since a sync can run unattended from the daily
 * cron and there's nobody there to see an uncaught exception.
 */
export async function syncCalendarFeed(client: SupabaseClient, feed: CalendarFeedRow): Promise<FeedSyncResult> {
  const safety = isSafeFeedUrl(feed.feed_url);
  if (!safety.safe) {
    return recordFailure(client, feed, safety.reason);
  }

  let icsText: string;
  try {
    icsText = await fetchIcsWithLimits(feed.feed_url);
  } catch (error) {
    return recordFailure(client, feed, describeFetchError(error));
  }

  let occurrences;
  try {
    const windowStart = new Date();
    const windowEnd = new Date(windowStart.getTime() + IMPORT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    occurrences = parseIcsFeed(icsText, windowStart, windowEnd);
  } catch {
    return recordFailure(client, feed, "That calendar's file wasn't in a format we could read.");
  }

  const externalSource = externalSourceForFeed(feed.id);
  const freshEvents: CalendarEventInsert[] = occurrences.map((occ) => ({
    household_id: feed.household_id,
    created_by_person_id: feed.created_by_person_id,
    title: occ.title,
    starts_at: occ.startsAt.toISOString(),
    ends_at: occ.endsAt.toISOString(),
    all_day: occ.allDay,
    event_type: "external",
    visibility: "household",
    external_source: externalSource,
    external_id: occ.externalId,
  }));

  let eventsImported: number;
  try {
    eventsImported = await replaceImportedEventsForFeed(client, feed.household_id, externalSource, freshEvents);
  } catch {
    return recordFailure(client, feed, "We read that calendar but couldn't save its events -- please try again.");
  }

  await calendarFeedsRepo.update(client, feed.id, {
    last_synced_at: new Date().toISOString(),
    last_sync_status: "ok",
    last_sync_error: null,
  });
  return { ok: true, eventsImported, error: null };
}

async function recordFailure(client: SupabaseClient, feed: CalendarFeedRow, reason: string): Promise<FeedSyncResult> {
  await calendarFeedsRepo.update(client, feed.id, {
    last_synced_at: new Date().toISOString(),
    last_sync_status: "error",
    last_sync_error: reason,
  });
  return { ok: false, eventsImported: 0, error: reason };
}

async function fetchIcsWithLimits(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEED_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "text/calendar, text/plain, */*" },
    });
    if (!response.ok) {
      throw new Error(`The calendar server responded with an error (HTTP ${response.status}).`);
    }
    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_FEED_BYTES) {
      throw new Error("That calendar feed is too large to import.");
    }
    const text = await response.text();
    if (text.length > MAX_FEED_BYTES) {
      throw new Error("That calendar feed is too large to import.");
    }
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

function describeFetchError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "AbortError") return "That calendar took too long to respond.";
    return error.message || "Couldn't reach that calendar.";
  }
  return "Couldn't reach that calendar.";
}
