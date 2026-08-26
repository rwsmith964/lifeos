// The custody recurrence engine (Phase 2 of the round-2 remediation
// brief). One generic mechanism — a repeating N-day cycle, each day
// assigned to a responsible parent, projected onto real dates from an
// anchor — covers every named real-world pattern (week-on/week-off,
// alternating weekends, 2-2-3, 2-2-5-5) as data, not code, plus anything
// a family's actual arrangement doesn't match a name for. Named presets
// below are just pre-filled cycle definitions for the common cases; the
// underlying engine doesn't know or care that they have names.
//
// Pure and DB-free by design, like lib/contact/cadence.ts — this is the
// part of the feature worth unit-testing exhaustively without a database.
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

export interface CustodyCycleAssignment {
  dayIndex: number;
  responsiblePersonId: string;
}

export interface CustodyScheduleDefinition {
  cycleLengthDays: number;
  cycleAssignments: CustodyCycleAssignment[];
  anchorDate: string; // yyyy-MM-dd, corresponds to dayIndex 0
  startDate: string; // yyyy-MM-dd, schedule takes effect
  endDate: string | null; // yyyy-MM-dd, null = ongoing
}

export interface ProjectedCustodyDay {
  date: string; // yyyy-MM-dd
  responsiblePersonId: string;
  isException: boolean;
}

/** Positive modulo — differenceInCalendarDays can be negative for dates before the anchor. */
function positiveMod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/**
 * Which parent the cycle assigns to a given date, ignoring exceptions and
 * the schedule's start/end window. Returns null if the cycle has no
 * assignment for that day index (an incomplete/custom cycle) — callers
 * treat that as "unassigned," not an error, so a partially-filled custom
 * cycle degrades to gaps rather than a crash.
 */
export function cycleAssignmentForDate(schedule: CustodyScheduleDefinition, date: string): string | null {
  const daysSinceAnchor = differenceInCalendarDays(parseISO(date), parseISO(schedule.anchorDate));
  const dayIndex = positiveMod(daysSinceAnchor, schedule.cycleLengthDays);
  return schedule.cycleAssignments.find((a) => a.dayIndex === dayIndex)?.responsiblePersonId ?? null;
}

/**
 * Projects a schedule onto every date in [windowStart, windowEnd] that
 * falls within the schedule's own [startDate, endDate] window, applying
 * exceptions (e.g. holidays) over the cycle's default assignment.
 * exceptionsByDate is keyed by yyyy-MM-dd.
 */
export function projectCustodySchedule(
  schedule: CustodyScheduleDefinition,
  exceptionsByDate: Map<string, string>,
  windowStart: Date,
  windowEnd: Date
): ProjectedCustodyDay[] {
  const days: ProjectedCustodyDay[] = [];
  const effectiveStart = schedule.startDate > format(windowStart, "yyyy-MM-dd") ? parseISO(schedule.startDate) : windowStart;
  const effectiveEndStr = schedule.endDate ?? format(windowEnd, "yyyy-MM-dd");
  const effectiveEnd = effectiveEndStr < format(windowEnd, "yyyy-MM-dd") ? parseISO(effectiveEndStr) : windowEnd;

  for (let d = effectiveStart; d <= effectiveEnd; d = addDays(d, 1)) {
    const dateStr = format(d, "yyyy-MM-dd");
    const exception = exceptionsByDate.get(dateStr);
    const responsiblePersonId = exception ?? cycleAssignmentForDate(schedule, dateStr);
    if (responsiblePersonId) {
      days.push({ date: dateStr, responsiblePersonId, isException: exception != null });
    }
  }
  return days;
}

/** Two-parent named presets. anchorDate is whatever date the user picks as "day 1" of the pattern — these aren't calendar-week-aware (day 0 isn't necessarily a Monday). */
export type CustodyPresetName = "week_on_week_off" | "alternating_weekends" | "two_two_three" | "two_two_five_five";

export function buildPresetCycle(
  preset: CustodyPresetName,
  primaryPersonId: string,
  secondaryPersonId: string
): { cycleLengthDays: number; cycleAssignments: CustodyCycleAssignment[] } {
  const assign = (days: number[], personId: string): CustodyCycleAssignment[] =>
    days.map((dayIndex) => ({ dayIndex, responsiblePersonId: personId }));

  switch (preset) {
    case "week_on_week_off":
      return {
        cycleLengthDays: 14,
        cycleAssignments: [
          ...assign([0, 1, 2, 3, 4, 5, 6], primaryPersonId),
          ...assign([7, 8, 9, 10, 11, 12, 13], secondaryPersonId),
        ],
      };
    case "alternating_weekends":
      // Primary has every weekday; weekends (days 5-6 of each 7-day week)
      // alternate primary/secondary across a 14-day cycle.
      return {
        cycleLengthDays: 14,
        cycleAssignments: [
          ...assign([0, 1, 2, 3, 4], primaryPersonId),
          ...assign([5, 6], primaryPersonId),
          ...assign([7, 8, 9, 10, 11], primaryPersonId),
          ...assign([12, 13], secondaryPersonId),
        ],
      };
    case "two_two_three":
      // Classic 2-2-3: days 0-1 primary, 2-3 secondary, 4-6 primary,
      // 7-8 secondary, 9-10 primary, 11-13 secondary.
      return {
        cycleLengthDays: 14,
        cycleAssignments: [
          ...assign([0, 1], primaryPersonId),
          ...assign([2, 3], secondaryPersonId),
          ...assign([4, 5, 6], primaryPersonId),
          ...assign([7, 8], secondaryPersonId),
          ...assign([9, 10], primaryPersonId),
          ...assign([11, 12, 13], secondaryPersonId),
        ],
      };
    case "two_two_five_five":
      return {
        cycleLengthDays: 14,
        cycleAssignments: [
          ...assign([0, 1], primaryPersonId),
          ...assign([2, 3], secondaryPersonId),
          ...assign([4, 5, 6, 7, 8], primaryPersonId),
          ...assign([9, 10, 11, 12, 13], secondaryPersonId),
        ],
      };
  }
}

export const CUSTODY_PRESET_LABELS: Record<CustodyPresetName, string> = {
  week_on_week_off: "Week on / week off",
  alternating_weekends: "Alternating weekends",
  two_two_three: "2-2-3",
  two_two_five_five: "2-2-5-5",
};

/** A date range with no responsible parent assigned by the cycle or an exception — surfaced in the schedule editor so gaps aren't silently invisible. */
export interface CustodyGap {
  startDate: string;
  endDate: string;
}

export function findGaps(projectedDays: ProjectedCustodyDay[], windowStart: Date, windowEnd: Date): CustodyGap[] {
  const covered = new Set(projectedDays.map((d) => d.date));
  const gaps: CustodyGap[] = [];
  let gapStart: string | null = null;

  for (let d = windowStart; d <= windowEnd; d = addDays(d, 1)) {
    const dateStr = format(d, "yyyy-MM-dd");
    if (!covered.has(dateStr)) {
      if (!gapStart) gapStart = dateStr;
    } else if (gapStart) {
      gaps.push({ startDate: gapStart, endDate: format(addDays(d, -1), "yyyy-MM-dd") });
      gapStart = null;
    }
  }
  if (gapStart) gaps.push({ startDate: gapStart, endDate: format(windowEnd, "yyyy-MM-dd") });
  return gaps;
}
