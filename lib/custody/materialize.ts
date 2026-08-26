// Turns a custody_schedules row into real custody_blocks rows — the DB
// half of lib/custody/schedule.ts's pure projection engine. Every reader
// in the app (calendar, the person page's custody card, brief generation)
// queries custody_blocks directly and stays untouched by this; a schedule
// is purely a generator. See DECISIONS.md D-033.
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, format } from "date-fns";
import type { CustodyScheduleRow } from "../db/database.types";
import { custodyBlocksRepo } from "../db/repositories/calendar";
import { listExceptionsForSchedule } from "../db/repositories/custody-schedules";
import { projectCustodySchedule, type ProjectedCustodyDay } from "./schedule";

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

/**
 * Regenerates custody_blocks for a schedule across a rolling window
 * starting today. Only touches blocks this schedule itself produced
 * (custody_schedule_id = schedule.id) — a manually created one-off block
 * is never affected. Safe to call repeatedly (e.g. after editing the
 * schedule): it deletes and re-inserts its own future window each time.
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

  // Clear this schedule's own future-window blocks before re-inserting —
  // never touches another schedule's blocks or manually created ones.
  const { error: deleteError } = await client
    .from("custody_blocks")
    .delete()
    .eq("custody_schedule_id", schedule.id)
    .gte("starts_at", windowStart.toISOString());
  if (deleteError) throw deleteError;

  if (runs.length === 0) return { blocksCreated: 0 };

  const rows = runs.map((run) => ({
    household_id: schedule.household_id,
    child_person_id: schedule.child_person_id,
    responsible_person_id: run.responsiblePersonId,
    starts_at: new Date(`${run.startDate}T${schedule.handover_time}`).toISOString(),
    // Same convention as the ad-hoc custody form: ends_at is the *last
    // covered day* at handover time, not the day after. Calendar
    // rendering derives which days a block spans via
    // startOfDay(starts_at)..startOfDay(ends_at) — using "day after"
    // here would silently extend every generated block's display by one
    // extra day.
    ends_at: new Date(`${run.endDate}T${schedule.handover_time}`).toISOString(),
    block_type: run.hasException ? ("holiday" as const) : ("regular" as const),
    location: schedule.handover_location,
    notes: "",
    custody_schedule_id: schedule.id,
  }));

  await custodyBlocksRepo.createMany(client, rows);
  return { blocksCreated: rows.length };
}
