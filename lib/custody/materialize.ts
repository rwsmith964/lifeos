// Turns a custody_schedules row into real custody_blocks rows — the DB
// half of lib/custody/schedule.ts's pure projection engine. Every reader
// in the app (calendar, the person page's custody card, brief generation)
// queries custody_blocks directly and stays untouched by this; a schedule
// is purely a generator. See DECISIONS.md D-033 (cycle model) and D-125
// (weekly_segments model).
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, format } from "date-fns";
import type { CustodyCycleAssignment, CustodyScheduleRow, CustodyWeeklySegment } from "../db/database.types";
import { custodyBlocksRepo } from "../db/repositories/calendar";
import { listExceptionsForSchedule } from "../db/repositories/custody-schedules";
import {
  cycleDayIndexForDate,
  handoverTimeForDayIndex,
  projectCustodySchedule,
  projectWeeklySegmentSchedule,
  type ProjectedCustodyDay,
} from "./schedule";

export const MATERIALIZE_WINDOW_DAYS = 90;

interface MergedRun {
  startDate: string;
  endDate: string; // inclusive, last day of the run
  responsiblePersonId: string;
  hasException: boolean;
}

/** Merges consecutive days assigned to the same parent into single runs — a custody block is a span, not one row per day. */
function mergeConsecutiveDays(days: ProjectedCustodyDay[]): MergedRun[] {
  const runs: MergedRun[] = [];
  for (const day of days) {
    const last = runs[runs.length - 1];
    const isConsecutive = last && format(addDays(new Date(`${last.endDate}T00:00:00`), 1), "yyyy-MM-dd") === day.date;
    if (last && isConsecutive && last.responsiblePersonId === day.responsiblePersonId) {
      last.endDate = day.date;
      last.hasException = last.hasException || day.isException;
    } else {
      runs.push({ startDate: day.date, endDate: day.date, responsiblePersonId: day.responsiblePersonId, hasException: day.isException });
    }
  }
  return runs;
}

/** A row shape ready for custodyBlocksRepo.createMany — shared by both recurrence-type branches below. */
interface MaterializedBlockRow {
  household_id: string;
  child_person_id: string;
  responsible_person_id: string;
  starts_at: string;
  ends_at: string;
  block_type: "regular" | "holiday";
  location: string | null;
  notes: string;
  custody_schedule_id: string;
}

/**
 * Narrows a CustodyScheduleRow to guarantee its cycle_* fields are
 * present. Every 'cycle' row satisfies this by the DB check constraint
 * (custody_schedules_recurrence_fields_check); this only guards against
 * a schedule being materialized as the wrong recurrence type by mistake.
 */
function assertCycleFields(
  schedule: CustodyScheduleRow
): asserts schedule is CustodyScheduleRow & {
  cycle_length_days: number;
  cycle_assignments: CustodyCycleAssignment[];
  anchor_date: string;
} {
  if (schedule.cycle_length_days == null || schedule.cycle_assignments == null || schedule.anchor_date == null) {
    throw new Error(`Custody schedule ${schedule.id} is recurrence_type 'cycle' but is missing its cycle fields.`);
  }
}

/** Same guarantee as assertCycleFields, for the 'weekly_segments' recurrence type. */
function assertWeeklySegmentsFields(
  schedule: CustodyScheduleRow
): asserts schedule is CustodyScheduleRow & { weekly_segments: CustodyWeeklySegment[] } {
  if (!schedule.weekly_segments || schedule.weekly_segments.length === 0) {
    throw new Error(`Custody schedule ${schedule.id} is recurrence_type 'weekly_segments' but has no weekly_segments.`);
  }
}

function materializeCycleRows(
  schedule: CustodyScheduleRow,
  exceptionsByDate: Map<string, string>,
  windowStart: Date,
  windowEnd: Date
): MaterializedBlockRow[] {
  assertCycleFields(schedule);
  const days = projectCustodySchedule(
    {
      cycleLengthDays: schedule.cycle_length_days,
      cycleAssignments: schedule.cycle_assignments,
      anchorDate: schedule.anchor_date,
      startDate: schedule.start_date,
      endDate: schedule.end_date,
    },
    exceptionsByDate,
    windowStart,
    windowEnd
  );
  const runs = mergeConsecutiveDays(days);

  return runs.map((run) => {
    // Each run's own handover time is resolved from whatever is configured
    // for the run's *start* day (e.g. Friday 4:30pm for a Fri-Sat-Sun run) —
    // this is what lets two different runs in the same schedule use two
    // different clock times (a Monday-starting run can independently use
    // 8:30am) instead of one shared handover_time. See DECISIONS.md D-074.
    //
    // ends_at reuses the *same* resolved time as starts_at, exactly like
    // the original single-handover_time code did (just resolved per-day
    // now instead of from one constant) — it does not borrow the next
    // run's start time. Two reasons: (1) it guarantees ends_at >= starts_at
    // even for a single-day run, where borrowing an earlier next-day time
    // (e.g. an 8am morning return following a 6pm evening pickup) would
    // otherwise invert the range and violate the DB check constraint; (2)
    // the calendar's day-grid rendering buckets a block by *date* only
    // (startOfDay(starts_at)..startOfDay(ends_at) inclusive — see
    // app/(app)/calendar/page.tsx), so keeping ends_at's date pinned to
    // run.endDate is what keeps day-ownership exactly matching the
    // per-cycle-day assignment; shifting it to the next day would make this
    // run bleed into the next run's first day. The real, precise "handover
    // to the next parent happens at 8:30am" instant is still captured
    // correctly — it's simply the *next* run's own starts_at, not this
    // run's ends_at.
    const startDayIndex = cycleDayIndexForDate(
      { anchorDate: schedule.anchor_date, cycleLengthDays: schedule.cycle_length_days },
      run.startDate
    );
    const resolvedTime = handoverTimeForDayIndex(schedule, startDayIndex);
    return {
      household_id: schedule.household_id,
      child_person_id: schedule.child_person_id,
      responsible_person_id: run.responsiblePersonId,
      starts_at: new Date(`${run.startDate}T${resolvedTime}`).toISOString(),
      ends_at: new Date(`${run.endDate}T${resolvedTime}`).toISOString(),
      block_type: run.hasException ? ("holiday" as const) : ("regular" as const),
      location: schedule.handover_location,
      notes: "",
      custody_schedule_id: schedule.id,
    };
  });
}

/**
 * 'weekly_segments' counterpart to materializeCycleRows. Each projected
 * interval already carries its own precise starts_at/ends_at clock time
 * (see projectWeeklySegmentSchedule) — unlike the cycle branch above,
 * ends_at is a real distinct instant, which is what lets a single
 * calendar day split into two custody_blocks rows (e.g. Friday 00:00-16:30
 * to one parent, 16:30-24:00 to the other).
 */
function materializeWeeklySegmentsRows(
  schedule: CustodyScheduleRow,
  exceptionsByDate: Map<string, string>,
  windowStart: Date,
  windowEnd: Date
): MaterializedBlockRow[] {
  assertWeeklySegmentsFields(schedule);
  const intervals = projectWeeklySegmentSchedule(
    schedule.weekly_segments,
    schedule.start_date,
    schedule.end_date,
    exceptionsByDate,
    windowStart,
    windowEnd
  );
  return intervals.map((interval) => ({
    household_id: schedule.household_id,
    child_person_id: schedule.child_person_id,
    responsible_person_id: interval.responsiblePersonId,
    starts_at: new Date(interval.startsAt).toISOString(),
    ends_at: new Date(interval.endsAt).toISOString(),
    block_type: interval.isException ? ("holiday" as const) : ("regular" as const),
    location: schedule.handover_location,
    notes: "",
    custody_schedule_id: schedule.id,
  }));
}

/**
 * Regenerates custody_blocks for a schedule across a rolling window
 * starting today. Only touches blocks this schedule itself produced
 * (custody_schedule_id = schedule.id) — a manually created one-off block
 * is never affected. Safe to call repeatedly (e.g. after editing the
 * schedule): it deletes and re-inserts its own future window each time.
 * Branches on recurrence_type — the 'cycle' path is byte-for-byte the
 * original logic; 'weekly_segments' is new (see D-125).
 */
export async function materializeCustodySchedule(
  client: SupabaseClient,
  schedule: CustodyScheduleRow,
  windowDays: number = MATERIALIZE_WINDOW_DAYS
): Promise<{ blocksCreated: number }> {
  const exceptions = await listExceptionsForSchedule(client, schedule.id);
  const exceptionsByDate = new Map(exceptions.map((e) => [e.exception_date, e.responsible_person_id]));

  const windowStart = new Date();
  windowStart.setHours(0, 0, 0, 0);
  const windowEnd = addDays(windowStart, windowDays);

  // Clear this schedule's own future-window blocks before re-inserting —
  // never touches another schedule's blocks or manually created ones.
  const { error: deleteError } = await client
    .from("custody_blocks")
    .delete()
    .eq("custody_schedule_id", schedule.id)
    .gte("starts_at", windowStart.toISOString());
  if (deleteError) throw deleteError;

  const rows =
    schedule.recurrence_type === "weekly_segments"
      ? materializeWeeklySegmentsRows(schedule, exceptionsByDate, windowStart, windowEnd)
      : materializeCycleRows(schedule, exceptionsByDate, windowStart, windowEnd);

  if (rows.length === 0) return { blocksCreated: 0 };

  await custodyBlocksRepo.createMany(client, rows);
  return { blocksCreated: rows.length };
}
