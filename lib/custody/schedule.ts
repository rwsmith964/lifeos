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
  const dayIndex = cycleDayIndexForDate(schedule, date);
  return schedule.cycleAssignments.find((a) => a.dayIndex === dayIndex)?.responsiblePersonId ?? null;
}

/** Which cycle dayIndex (0..cycleLengthDays-1) a real date maps to. Exposed separately from cycleAssignmentForDate so materialize.ts can also resolve a per-day handover time override for the same dayIndex without recomputing it. */
export function cycleDayIndexForDate(schedule: Pick<CustodyScheduleDefinition, "anchorDate" | "cycleLengthDays">, date: string): number {
  const daysSinceAnchor = differenceInCalendarDays(parseISO(date), parseISO(schedule.anchorDate));
  return positiveMod(daysSinceAnchor, schedule.cycleLengthDays);
}

/**
 * Resolves the handover time that applies to a given cycle dayIndex: the
 * per-day override in custom_handover_times if one is set for that day,
 * otherwise the schedule's single handover_time. Lets a schedule express
 * different clock times for different handovers (e.g. Friday 4:30pm pickup
 * vs. Monday 8:30am return) instead of one time for every transition. See
 * DECISIONS.md D-074.
 */
export function handoverTimeForDayIndex(
  schedule: { handover_time: string; custom_handover_times: Record<string, string> | null },
  dayIndex: number
): string {
  return schedule.custom_handover_times?.[String(dayIndex)] ?? schedule.handover_time;
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

// ---------------------------------------------------------------------
// Weekly day-of-week + handoff-time recurrence ('weekly_segments')
// ---------------------------------------------------------------------
//
// The cycle engine above assigns exactly one responsible parent to each
// *whole calendar day*. Some real custody agreements are bound to the
// day of week with handoffs at a specific clock time, and can split a
// single calendar day between two people (e.g. Friday: one parent until
// 4:30pm, the other from 4:30pm) -- something a day-granularity cycle
// cannot express (ends_at would have to reuse starts_at's date). This
// second, independent recurrence type covers that case; the cycle engine
// above is completely unchanged and remains the default. See migration
// 20260902000001 and DECISIONS.md D-125.

export interface CustodyWeeklySegmentDefinition {
  dayOfWeek: number; // 0 (Sunday) .. 6 (Saturday), matches Date#getDay()
  time: string; // "HH:MM", 24-hour
  responsiblePersonId: string;
}

export interface ProjectedCustodyInterval {
  startsAt: string; // "yyyy-MM-ddTHH:mm:00" naive local datetime
  endsAt: string;
  responsiblePersonId: string;
  isException: boolean;
}

/** Minutes since Sunday 00:00 for a (dayOfWeek, "HH:MM") pair — the single circular sort/compare key every weekly-segment breakpoint is placed on. */
function weekMinutesOf(dayOfWeek: number, time: string): number {
  const [hourStr, minuteStr] = time.split(":");
  return dayOfWeek * 24 * 60 + Number(hourStr) * 60 + Number(minuteStr);
}

/**
 * Who the weekly pattern assigns at a given point in the week (ignoring
 * exceptions), where `atWeekMinutes` is minutes-since-Sunday-midnight.
 * `sorted` must be non-empty and sorted ascending by weekMinutesOf.
 * Wraps circularly: a query before the week's earliest breakpoint
 * resolves to the last breakpoint of the *previous* week — i.e. whichever
 * segment sorts last, since the pattern repeats every week.
 */
function personAtWeekMinutes(sorted: CustodyWeeklySegmentDefinition[], atWeekMinutes: number): string {
  let current = sorted[sorted.length - 1].responsiblePersonId;
  for (const seg of sorted) {
    if (weekMinutesOf(seg.dayOfWeek, seg.time) <= atWeekMinutes) {
      current = seg.responsiblePersonId;
    } else {
      break;
    }
  }
  return current;
}

function combineDateAndTime(date: string, time: string): string {
  return `${date}T${time}:00`;
}

/**
 * Projects a fixed weekly day-of-week/time pattern onto real dates — the
 * 'weekly_segments' counterpart to projectCustodySchedule. Every interval
 * carries its own start and end clock time (not just a date), so unlike
 * the cycle model this can represent multiple handoffs within a single
 * calendar day.
 *
 * Exceptions override the *entire* calendar day regardless of segments —
 * identical whole-day semantics to the cycle model's exceptions (see
 * QUESTIONS.md QUEUE-032). `segments` need not be exhaustive: only the
 * breakpoints where responsibility actually changes are required, since
 * `personAtWeekMinutes` fills in every day/time in between by carrying
 * the most recent breakpoint forward (circularly across the week) — but
 * the UI may also submit one breakpoint per literal day the user
 * selected, which behaves identically.
 */
export function projectWeeklySegmentSchedule(
  segments: CustodyWeeklySegmentDefinition[],
  scheduleStartDate: string,
  scheduleEndDate: string | null,
  exceptionsByDate: Map<string, string>,
  windowStart: Date,
  windowEnd: Date
): ProjectedCustodyInterval[] {
  if (segments.length === 0) return [];
  const sorted = [...segments].sort((a, b) => weekMinutesOf(a.dayOfWeek, a.time) - weekMinutesOf(b.dayOfWeek, b.time));

  const effectiveStart = scheduleStartDate > format(windowStart, "yyyy-MM-dd") ? parseISO(scheduleStartDate) : windowStart;
  const effectiveEndStr = scheduleEndDate ?? format(windowEnd, "yyyy-MM-dd");
  const effectiveEnd = effectiveEndStr < format(windowEnd, "yyyy-MM-dd") ? parseISO(effectiveEndStr) : windowEnd;

  const raw: ProjectedCustodyInterval[] = [];
  for (let d = effectiveStart; d <= effectiveEnd; d = addDays(d, 1)) {
    const dateStr = format(d, "yyyy-MM-dd");
    const nextDateStr = format(addDays(d, 1), "yyyy-MM-dd");
    const dow = d.getDay();
    const exception = exceptionsByDate.get(dateStr);

    if (exception) {
      raw.push({
        startsAt: combineDateAndTime(dateStr, "00:00"),
        endsAt: combineDateAndTime(nextDateStr, "00:00"),
        responsiblePersonId: exception,
        isException: true,
      });
      continue;
    }

    // Breakpoints landing on this specific weekday, in time order, applied
    // on top of whoever the pattern already assigns at this day's midnight.
    const daySegments = sorted.filter((s) => s.dayOfWeek === dow);
    let cursorTime = "00:00";
    let cursorPerson = personAtWeekMinutes(sorted, dow * 24 * 60);
    for (const seg of daySegments) {
      if (seg.time !== cursorTime) {
        raw.push({
          startsAt: combineDateAndTime(dateStr, cursorTime),
          endsAt: combineDateAndTime(dateStr, seg.time),
          responsiblePersonId: cursorPerson,
          isException: false,
        });
      }
      cursorTime = seg.time;
      cursorPerson = seg.responsiblePersonId;
    }
    raw.push({
      startsAt: combineDateAndTime(dateStr, cursorTime),
      endsAt: combineDateAndTime(nextDateStr, "00:00"),
      responsiblePersonId: cursorPerson,
      isException: false,
    });
  }

  // Merge adjacent intervals for the same person (e.g. a run of several
  // exception-free days between breakpoints) into a single span, same
  // spirit as materialize.ts's mergeConsecutiveDays for the cycle model.
  const merged: ProjectedCustodyInterval[] = [];
  for (const interval of raw) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.endsAt === interval.startsAt &&
      last.responsiblePersonId === interval.responsiblePersonId &&
      last.isException === interval.isException
    ) {
      last.endsAt = interval.endsAt;
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

const WEEKLY_SEGMENT_DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Human-readable breakpoint label for the detail-page summary, e.g. "Fri 4:30 PM" — the caller attaches the responsible person's name. */
export function describeWeeklySegmentBreakpoint(segment: CustodyWeeklySegmentDefinition): string {
  return `${WEEKLY_SEGMENT_DAY_LABELS[segment.dayOfWeek]} ${formatHandoverTime(segment.time)}`;
}

/**
 * One-line summary of a whole weekly_segments pattern for list/detail
 * views, e.g. "Mon 8:30 AM -> Mel, Fri 4:30 PM -> Richard" -- the
 * 'weekly_segments' counterpart to describeCustodyHandoverTimes. Sorted
 * by weekMinutesOf so breakpoints always read in week order regardless
 * of storage/submission order. Takes a name lookup since this pure lib
 * has no person-name data of its own.
 */
export function describeWeeklySegmentsPattern(
  segments: CustodyWeeklySegmentDefinition[],
  peopleNamesById: Map<string, string>
): string {
  return [...segments]
    .sort((a, b) => weekMinutesOf(a.dayOfWeek, a.time) - weekMinutesOf(b.dayOfWeek, b.time))
    .map((s) => `${describeWeeklySegmentBreakpoint(s)} → ${peopleNamesById.get(s.responsiblePersonId) ?? "Unknown"}`)
    .join(", ");
}

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

/** "17:00" / "17:00:00" -> "5 PM" / "4:30 PM" — never show a raw 24-hour or seconds-precision string to the user. */
export function formatHandoverTime(hhmm: string): string {
  const [hourStr, minute] = hhmm.split(":");
  const hour = Number(hourStr);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return !minute || minute === "00" ? `${displayHour} ${period}` : `${displayHour}:${minute} ${period}`;
}

const WEEKDAY_ABBREVIATIONS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Human-readable summary of a schedule's handover time(s) for display —
 * "Handover 5 PM" for the common single-time case, or a per-day breakdown
 * like "Handover Fri 4:30 PM, Mon 8:30 AM" once custom_handover_times has
 * overrides, so a schedule with two different clock times (see D-074)
 * doesn't silently show only its first/global one.
 */
export function describeCustodyHandoverTimes(schedule: {
  handover_time: string;
  custom_handover_times: Record<string, string> | null;
  anchor_date: string;
  cycle_length_days: number;
}): string {
  const overrides = schedule.custom_handover_times;
  if (!overrides || Object.keys(overrides).length === 0) {
    return `Handover ${formatHandoverTime(schedule.handover_time)}`;
  }
  // dayIndex only maps to a single fixed weekday across every cycle
  // iteration when the cycle length is a whole number of weeks (true for
  // the Weekly builder, which always uses a 7-day cycle) -- for any other
  // cycle length, fall back to "Day N" rather than showing a weekday label
  // that would be wrong in later iterations.
  const anchorWeekdayIndex = parseISO(schedule.anchor_date).getDay();
  const canLabelByWeekday = schedule.cycle_length_days % 7 === 0;
  const parts = Object.entries(overrides)
    .map(([dayIndexStr, time]) => ({ dayIndex: Number(dayIndexStr), time }))
    .sort((a, b) => a.dayIndex - b.dayIndex)
    .map(({ dayIndex, time }) => {
      const label = canLabelByWeekday ? WEEKDAY_ABBREVIATIONS[(anchorWeekdayIndex + dayIndex) % 7] : `Day ${dayIndex + 1}`;
      return `${label} ${formatHandoverTime(time)}`;
    });
  return `Handover ${parts.join(", ")}`;
}
