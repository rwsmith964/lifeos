import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type {
  TimeOffEntryInsert,
  TimeOffEntryRow,
  TimeOffEntryUpdate,
  WorkScheduleInsert,
  WorkScheduleRow,
  WorkScheduleUpdate,
} from "../database.types";

export const workSchedulesRepo = createRepository<WorkScheduleRow, WorkScheduleInsert, WorkScheduleUpdate>(
  "work_schedules"
);

export const timeOffEntriesRepo = createRepository<TimeOffEntryRow, TimeOffEntryInsert, TimeOffEntryUpdate>(
  "time_off_entries"
);

export async function listWorkSchedulesForPerson(
  client: SupabaseClient,
  personId: string
): Promise<WorkScheduleRow[]> {
  return workSchedulesRepo.list(client, (q) =>
    q.eq("person_id", personId).order("day_of_week", { ascending: true }).order("start_time", { ascending: true })
  );
}

export async function listTimeOffForPerson(
  client: SupabaseClient,
  personId: string
): Promise<TimeOffEntryRow[]> {
  return timeOffEntriesRepo.list(client, (q) =>
    q.eq("person_id", personId).order("start_date", { ascending: false })
  );
}

/**
 * All active weekly work-schedule rows for a set of people (typically every
 * person in the current household) — the calendar page's own occurrence
 * generator (lib/calendar/work-schedule.ts) expands these into per-day
 * shifts for the visible range. Neither table has a household_id column
 * (they're person-scoped, like person_gift_sites), so the caller passes
 * the household's already-fetched person ids rather than filtering here.
 */
export async function listWorkSchedulesForPeople(
  client: SupabaseClient,
  personIds: string[]
): Promise<WorkScheduleRow[]> {
  if (personIds.length === 0) return [];
  return workSchedulesRepo.list(client, (q) => q.in("person_id", personIds));
}

/**
 * Time-off entries for a set of people that overlap [rangeStart, rangeEnd]
 * (inclusive, "yyyy-MM-dd" strings) — an entry overlaps the range if it
 * starts on or before the range end AND ends on or after the range start.
 */
export async function listTimeOffForPeopleInRange(
  client: SupabaseClient,
  personIds: string[],
  rangeStart: string,
  rangeEnd: string
): Promise<TimeOffEntryRow[]> {
  if (personIds.length === 0) return [];
  return timeOffEntriesRepo.list(client, (q) =>
    q.in("person_id", personIds).lte("start_date", rangeEnd).gte("end_date", rangeStart)
  );
}
