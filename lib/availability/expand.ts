// Expands a recurring availability pattern ("her kids' weeks", "school
// Mon-Fri 8-3") into the concrete days it covers for a window. Pure and
// DB-free; the calendar and the weekend planner both use it so they can never
// disagree about when someone is busy.
import { addDays, differenceInCalendarDays, format, parseISO, startOfDay } from "date-fns";

export type AvailabilityKind = "busy" | "school";

export interface PatternDay {
  dayIndex: number;
  /** "HH:MM", or null for all day. */
  startTime: string | null;
  endTime: string | null;
}

export interface SkipRange {
  start: string;
  end: string;
  label?: string;
}

export interface AvailabilityScheduleLike {
  id: string;
  person_id: string;
  kind: AvailabilityKind;
  label: string;
  cycle_length_days: number;
  pattern: PatternDay[];
  anchor_date: string;
  start_date: string;
  end_date: string | null;
  skip_ranges: SkipRange[];
}

export interface AvailabilityOccurrence {
  scheduleId: string;
  personId: string;
  kind: AvailabilityKind;
  label: string;
  /** yyyy-MM-dd */
  date: string;
  startTime: string | null;
  endTime: string | null;
}

function dayIndexFor(date: Date, anchorDate: string, cycleLength: number): number {
  const diff = differenceInCalendarDays(date, parseISO(anchorDate));
  return ((diff % cycleLength) + cycleLength) % cycleLength;
}

function inSkipRange(dateKey: string, ranges: SkipRange[]): boolean {
  return ranges.some((r) => dateKey >= r.start && dateKey <= r.end);
}

/** Every day in [rangeStart, rangeEnd] (by calendar day, inclusive) the schedule is active, with that day's times. */
export function expandAvailability(
  schedule: AvailabilityScheduleLike,
  rangeStart: Date,
  rangeEnd: Date
): AvailabilityOccurrence[] {
  const byIndex = new Map(schedule.pattern.map((p) => [p.dayIndex, p]));
  const occurrences: AvailabilityOccurrence[] = [];
  const last = startOfDay(rangeEnd);

  for (let day = startOfDay(rangeStart); day <= last; day = addDays(day, 1)) {
    const dateKey = format(day, "yyyy-MM-dd");
    if (dateKey < schedule.start_date) continue;
    if (schedule.end_date && dateKey > schedule.end_date) continue;
    if (inSkipRange(dateKey, schedule.skip_ranges)) continue;

    const entry = byIndex.get(dayIndexFor(day, schedule.anchor_date, schedule.cycle_length_days));
    if (!entry) continue;

    occurrences.push({
      scheduleId: schedule.id,
      personId: schedule.person_id,
      kind: schedule.kind,
      label: schedule.label,
      date: dateKey,
      startTime: entry.startTime,
      endTime: entry.endTime,
    });
  }
  return occurrences;
}

/** Dates (yyyy-MM-dd) on which a person has at least one active 'busy' occurrence -- what the weekend planner treats as "not free". */
export function busyDatesForPerson(
  schedules: AvailabilityScheduleLike[],
  personId: string,
  rangeStart: Date,
  rangeEnd: Date
): Set<string> {
  const dates = new Set<string>();
  for (const schedule of schedules) {
    if (schedule.kind !== "busy" || schedule.person_id !== personId) continue;
    for (const occurrence of expandAvailability(schedule, rangeStart, rangeEnd)) dates.add(occurrence.date);
  }
  return dates;
}
