// Gathers everyone's busy time and works out when you and another person can
// do something together. The other person's schedule comes from one of three
// places: your own household (a member), a connected household (only if they
// chose to share busy times -- time ranges, never titles), or nowhere.
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, addHours, startOfDay } from "date-fns";
import type { CalendarEventRow, PersonRow } from "../db/database.types";
import { listActivitiesWithLocations } from "../db/repositories/activities";
import {
  listAttendeesForEvents,
  listCustodyBlocksForHouseholdInRange,
  listEventsInRange,
} from "../db/repositories/calendar";
import { listLinkedAccounts, listSharesForLinks } from "../db/repositories/links";
import { listWorkSchedulesForPeople, listTimeOffForPeopleInRange } from "../db/repositories/work-schedule";
import { timeOffInRange, withTimeOfDay, workShiftsInRange } from "../calendar/work-schedule";
import {
  fitActivity,
  freeWindows,
  overlapsAny,
  rankWindows,
  type Interval,
} from "./find-time";

export type TheirScheduleSource = "household" | "shared" | "not_shared" | "unlinked";

export interface FindTimeOption {
  start: Date;
  end: Date;
  weekend: boolean;
  /** You have the kids at some point in this window. */
  youHaveKids: boolean;
  /** They have their kids (only known when they share it). */
  theyHaveKids: boolean | null;
}

export interface FindTimeResult {
  person: { id: string; name: string };
  activity: string;
  durationMinutes: number;
  source: TheirScheduleSource;
  options: FindTimeOption[];
  /** Saved places for this activity, e.g. fishing spots. */
  places: Array<{ activity: string; location: string }>;
}

const DAY_START_HOUR = 7;
const DAY_END_HOUR = 20;
const RANGE_DAYS = 21;
const DEFAULT_DURATION = 180;

function timedBusy(events: CalendarEventRow[]): Interval[] {
  return events.filter((e) => !e.all_day).map((e) => ({ start: new Date(e.starts_at), end: new Date(e.ends_at) }));
}

async function householdBusyFor(
  supabase: SupabaseClient,
  householdId: string,
  person: PersonRow,
  events: CalendarEventRow[],
  attendeesByEvent: Map<string, string[]>,
  start: Date,
  end: Date
): Promise<Interval[]> {
  // Events they created or are listed on.
  const theirs = events.filter(
    (e) => e.created_by_person_id === person.id || (attendeesByEvent.get(e.id) ?? []).includes(person.id)
  );
  const busy = timedBusy(theirs);

  // Their work shifts and time off.
  const [schedules, timeOff] = await Promise.all([
    listWorkSchedulesForPeople(supabase, [person.id]).catch(() => []),
    listTimeOffForPeopleInRange(supabase, [person.id], start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)).catch(() => []),
  ]);
  const shiftPeople = [{ id: person.id, full_name: person.full_name, nickname: person.nickname }];
  for (const s of workShiftsInRange(schedules, timeOff, shiftPeople, start, end)) {
    busy.push({ start: withTimeOfDay(s.date, s.startTime), end: withTimeOfDay(s.date, s.endTime) });
  }
  for (const t of timeOffInRange(timeOff, shiftPeople, start, end)) {
    busy.push({ start: withTimeOfDay(t.date, "00:00"), end: withTimeOfDay(t.date, "23:59") });
  }
  void householdId;
  return busy;
}

export async function findTimeWith(
  supabase: SupabaseClient,
  params: {
    householdId: string;
    selfPerson: PersonRow;
    other: PersonRow;
    activity: string;
    now: Date;
  }
): Promise<FindTimeResult> {
  const { householdId, selfPerson, other, activity, now } = params;
  const rangeStart = addHours(startOfDay(now), now.getHours() + 1);
  const rangeEnd = addDays(startOfDay(now), RANGE_DAYS);

  const [events, custody, activities] = await Promise.all([
    listEventsInRange(supabase, householdId, rangeStart.toISOString(), rangeEnd.toISOString()),
    listCustodyBlocksForHouseholdInRange(supabase, householdId, rangeStart.toISOString(), rangeEnd.toISOString()),
    listActivitiesWithLocations(supabase, householdId).catch(() => []),
  ]);
  const attendeeRows = await listAttendeesForEvents(supabase, events.map((e) => e.id));
  const attendeesByEvent = new Map<string, string[]>(
    [...attendeeRows.entries()].map(([eventId, rows]) => [eventId, rows.map((r) => r.personId)])
  );

  const myBusy = await householdBusyFor(supabase, householdId, selfPerson, events, attendeesByEvent, rangeStart, rangeEnd);
  const myKids: Interval[] = custody
    .filter((c) => c.responsible_person_id === selfPerson.id)
    .map((c) => ({ start: new Date(c.starts_at), end: new Date(c.ends_at) }));

  // Their side.
  let source: TheirScheduleSource = "unlinked";
  let theirBusy: Interval[] | null = null;
  let theirKids: Interval[] | null = null;

  if (other.user_id) {
    source = "household";
    theirBusy = await householdBusyFor(supabase, householdId, other, events, attendeesByEvent, rangeStart, rangeEnd);
    theirKids = custody
      .filter((c) => c.responsible_person_id === other.id)
      .map((c) => ({ start: new Date(c.starts_at), end: new Date(c.ends_at) }));
  } else if (other.linked_user_id) {
    const accounts = await listLinkedAccounts(supabase, householdId).catch(() => []);
    const account = accounts.find((a) => a.userId === other.linked_user_id);
    if (account) {
      const shares = await listSharesForLinks(supabase, [account.linkId]).catch(() => []);
      const sharing = (category: "busy_times" | "custody") =>
        shares.some((s) => s.sharing_household_id === account.otherHouseholdId && s.category === category && s.enabled);
      if (sharing("busy_times")) {
        source = "shared";
        const { data } = await supabase.rpc("linked_busy_blocks", {
          p_other_household: account.otherHouseholdId,
          p_start: rangeStart.toISOString(),
          p_end: rangeEnd.toISOString(),
        });
        theirBusy = ((data ?? []) as Array<{ starts_at: string; ends_at: string; all_day: boolean }>)
          .filter((b) => !b.all_day)
          .map((b) => ({ start: new Date(b.starts_at), end: new Date(b.ends_at) }));
        if (sharing("custody")) {
          const { data: kids } = await supabase.rpc("linked_custody_blocks", {
            p_other_household: account.otherHouseholdId,
            p_start: rangeStart.toISOString(),
            p_end: rangeEnd.toISOString(),
          });
          theirKids = ((kids ?? []) as Array<{ starts_at: string; ends_at: string }>).map((b) => ({
            start: new Date(b.starts_at),
            end: new Date(b.ends_at),
          }));
        }
      } else {
        source = "not_shared";
      }
    }
  }

  // The activity: which saved one, how long it takes, and where.
  const words = activity.toLowerCase().split(/\s+/).filter((w) => w.length >= 4);
  const matched = activities.filter((a) => words.some((w) => a.activity_type.toLowerCase().includes(w)));
  const durationMinutes = matched[0]?.typical_duration_minutes ?? DEFAULT_DURATION;
  const places = matched
    .flatMap((a) => a.locations.map((l) => ({ activity: a.activity_type, location: l.name })))
    .slice(0, 3);

  // With no view of their schedule, still show when YOU are free so they can confirm.
  const busyLists = theirBusy ? [myBusy, theirBusy] : [myBusy];
  const windows = rankWindows(
    freeWindows({ rangeStart, rangeEnd, busy: busyLists, minMinutes: durationMinutes, dayStartHour: DAY_START_HOUR, dayEndHour: DAY_END_HOUR }),
    4
  );

  const options: FindTimeOption[] = windows.map((w) => {
    const fit = fitActivity(w, durationMinutes);
    return {
      start: fit.start,
      end: fit.end,
      weekend: w.weekend,
      youHaveKids: overlapsAny(fit, myKids),
      theyHaveKids: theirKids ? overlapsAny(fit, theirKids) : null,
    };
  });

  return {
    person: { id: other.id, name: other.nickname || other.full_name },
    activity,
    durationMinutes,
    source,
    options,
    places,
  };
}
