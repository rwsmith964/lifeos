import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type {
  CalendarEventInsert,
  CalendarEventRow,
  CalendarEventUpdate,
  CalendarFeedInsert,
  CalendarFeedRow,
  CalendarFeedUpdate,
  CustodyBlockInsert,
  CustodyBlockRow,
  CustodyBlockUpdate,
  EventAttendeeInsert,
  EventAttendeeRow,
  EventAttendeeUpdate,
} from "../database.types";

export const calendarEventsRepo = createRepository<
  CalendarEventRow,
  CalendarEventInsert,
  CalendarEventUpdate
>("calendar_events");

export const calendarFeedsRepo = createRepository<
  CalendarFeedRow,
  CalendarFeedInsert,
  CalendarFeedUpdate
>("calendar_feeds");

export const eventAttendeesRepo = createRepository<
  EventAttendeeRow,
  EventAttendeeInsert,
  EventAttendeeUpdate
>("event_attendees");

export const custodyBlocksRepo = createRepository<
  CustodyBlockRow,
  CustodyBlockInsert,
  CustodyBlockUpdate
>("custody_blocks");

export async function listEventsInRange(
  client: SupabaseClient,
  householdId: string,
  startsAtISO: string,
  endsAtISO: string
): Promise<CalendarEventRow[]> {
  return calendarEventsRepo.list(client, (q) =>
    q
      .eq("household_id", householdId)
      .gte("starts_at", startsAtISO)
      .lt("starts_at", endsAtISO)
      .order("starts_at", { ascending: true })
  );
}

export async function listAttendeesForEvent(
  client: SupabaseClient,
  calendarEventId: string
): Promise<EventAttendeeRow[]> {
  return eventAttendeesRepo.list(client, (q) => q.eq("calendar_event_id", calendarEventId));
}

/** Batch fetch, grouped by calendar_event_id, for rendering an agenda list without one query per event. */
export async function listAttendeeNamesForEvents(
  client: SupabaseClient,
  calendarEventIds: string[]
): Promise<Map<string, string[]>> {
  const byEvent = new Map<string, string[]>();
  if (calendarEventIds.length === 0) return byEvent;

  const { data, error } = await client
    .from("event_attendees")
    .select("calendar_event_id, person:people(full_name)")
    .in("calendar_event_id", calendarEventIds);
  if (error) throw error;

  type AttendeeRow = { calendar_event_id: string; person: { full_name: string } | { full_name: string }[] | null };
  for (const row of (data ?? []) as unknown as AttendeeRow[]) {
    const person = Array.isArray(row.person) ? row.person[0] : row.person;
    if (!person) continue;
    const names = byEvent.get(row.calendar_event_id) ?? [];
    names.push(person.full_name);
    byEvent.set(row.calendar_event_id, names);
  }
  return byEvent;
}

/** Upcoming events this person is attending, for their CRM detail page. */
export async function listUpcomingEventsForPerson(
  client: SupabaseClient,
  personId: string,
  fromISO: string,
  limit = 10
): Promise<CalendarEventRow[]> {
  const { data, error } = await client
    .from("event_attendees")
    .select("calendar_event:calendar_events!inner(*)")
    .eq("person_id", personId)
    .gte("calendar_event.starts_at", fromISO)
    .order("starts_at", { referencedTable: "calendar_events", ascending: true })
    .limit(limit);
  if (error) throw error;

  type Row = { calendar_event: CalendarEventRow | CalendarEventRow[] | null };
  return ((data ?? []) as unknown as Row[])
    .map((row) => (Array.isArray(row.calendar_event) ? row.calendar_event[0] : row.calendar_event))
    .filter((e): e is CalendarEventRow => e != null);
}

// Overlap, not "starts in range": .gte("starts_at", X) missed any block
// that started before the window but extends into it — a 3-day custody
// span queried for the day after it started would silently vanish. The
// correct window filter for a range row is starts_at < windowEnd AND
// ends_at > windowStart (round-2 D-033 regression — see 2.1).

export async function listCustodyBlocksForChildInRange(
  client: SupabaseClient,
  childPersonId: string,
  startsAtISO: string,
  endsAtISO: string
): Promise<CustodyBlockRow[]> {
  return custodyBlocksRepo.list(client, (q) =>
    q
      .eq("child_person_id", childPersonId)
      .lt("starts_at", endsAtISO)
      .gt("ends_at", startsAtISO)
      .order("starts_at", { ascending: true })
  );
}

export async function listCustodyBlocksForHouseholdInRange(
  client: SupabaseClient,
  householdId: string,
  startsAtISO: string,
  endsAtISO: string
): Promise<CustodyBlockRow[]> {
  return custodyBlocksRepo.list(client, (q) =>
    q
      .eq("household_id", householdId)
      .lt("starts_at", endsAtISO)
      .gt("ends_at", startsAtISO)
      .order("starts_at", { ascending: true })
  );
}

// Module 4 (D-120) two-way sync helpers ----------------------------------

/** LifeOS-native events already round-tripped to a given sync account -- used by two-way-sync.ts to avoid re-importing an event we ourselves pushed (the classic "push echoes back on next pull" duplication bug). */
export async function listEventsSyncedToAccount(
  client: SupabaseClient,
  syncAccountId: string
): Promise<CalendarEventRow[]> {
  return calendarEventsRepo.list(client, (q) => q.eq("synced_to_account_id", syncAccountId));
}

/**
 * LifeOS-native events eligible for a first push to a two-way sync
 * account: not already synced anywhere, not themselves imported from an
 * external source, and within the same forward-looking window feed-sync
 * already uses for imports (see IMPORT_WINDOW_DAYS in ics-import.ts) --
 * pushing years of past events on every cron run would be pure waste.
 */
export async function listUnsyncedLocalEventsForHousehold(
  client: SupabaseClient,
  householdId: string,
  windowEndISO: string
): Promise<CalendarEventRow[]> {
  return calendarEventsRepo.list(client, (q) =>
    q
      .eq("household_id", householdId)
      .is("synced_to_account_id", null)
      .is("external_source", null)
      .neq("event_type", "external")
      .lt("starts_at", windowEndISO)
      .order("starts_at", { ascending: true })
  );
}

// calendar_feeds ---------------------------------------------------------
// P3-6: a household's connected Google Calendar/iCal feeds, and the
// imported calendar_events rows each one owns (tagged via
// external_source, see lib/calendar/ics-import.ts).

export async function listCalendarFeedsForHousehold(
  client: SupabaseClient,
  householdId: string
): Promise<CalendarFeedRow[]> {
  return calendarFeedsRepo.list(client, (q) =>
    q.eq("household_id", householdId).order("created_at", { ascending: true })
  );
}

/**
 * Replace every previously-imported occurrence for one feed with a fresh
 * batch in a single round trip: delete-then-insert rather than a diffing
 * upsert, since a feed resync has no stable identity to diff against
 * beyond "everything this feed produced last time" (a recurring event's
 * RRULE can change entirely between syncs -- e.g. more/fewer occurrences,
 * a different weekday). Simpler and just as correct for a household-sized
 * feed, and it's what the resync button optimizes for (see D-088).
 */
export async function replaceImportedEventsForFeed(
  client: SupabaseClient,
  householdId: string,
  externalSource: string,
  freshEvents: CalendarEventInsert[]
): Promise<number> {
  await deleteImportedEventsForFeed(client, householdId, externalSource);

  if (freshEvents.length === 0) return 0;
  const inserted = await calendarEventsRepo.createMany(client, freshEvents);
  return inserted.length;
}

/** Delete-only counterpart of replaceImportedEventsForFeed, used when a feed itself is removed rather than resynced. */
export async function deleteImportedEventsForFeed(
  client: SupabaseClient,
  householdId: string,
  externalSource: string
): Promise<void> {
  const { error } = await client
    .from("calendar_events")
    .delete()
    .eq("household_id", householdId)
    .eq("external_source", externalSource);
  if (error) throw error;
}
