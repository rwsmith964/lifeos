import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type {
  CalendarEventInsert,
  CalendarEventRow,
  CalendarEventUpdate,
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

export async function listCustodyBlocksForChildInRange(
  client: SupabaseClient,
  childPersonId: string,
  startsAtISO: string,
  endsAtISO: string
): Promise<CustodyBlockRow[]> {
  return custodyBlocksRepo.list(client, (q) =>
    q
      .eq("child_person_id", childPersonId)
      .gte("starts_at", startsAtISO)
      .lt("starts_at", endsAtISO)
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
      .gte("starts_at", startsAtISO)
      .lt("starts_at", endsAtISO)
      .order("starts_at", { ascending: true })
  );
}
