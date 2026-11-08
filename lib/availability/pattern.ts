// Turns what the editor collects ("alternating weeks, Mon-Fri busy in week
// 1, nothing in week 2") into the stored pattern, and back into a readable
// summary. Weeks always start on Monday, and the anchor is snapped to a
// Monday, so dayIndex 0 is always a Monday and the editor never has to ask
// anyone to think in "day index" terms.
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import type { AvailabilityPatternDay } from "../db/database.types";

/** Monday-first weekday names, matching the editor's toggle order. */
export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** The Monday of the week containing `date`, as yyyy-MM-dd. */
export function anchorMondayOf(date: string | Date): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

/**
 * weeks[w][d] = true if weekday d (0 = Monday) of week w is active. One week
 * = a 7-day cycle ("every week"); two = a 14-day cycle ("alternating weeks").
 */
export function buildPattern(
  weeks: boolean[][],
  times: { startTime: string | null; endTime: string | null }
): AvailabilityPatternDay[] {
  const pattern: AvailabilityPatternDay[] = [];
  weeks.forEach((week, weekIndex) => {
    week.forEach((active, weekdayIndex) => {
      if (active) pattern.push({ dayIndex: weekIndex * 7 + weekdayIndex, startTime: times.startTime, endTime: times.endTime });
    });
  });
  return pattern;
}

function summarizeWeek(pattern: AvailabilityPatternDay[], offset: number): string {
  const days = pattern.filter((p) => p.dayIndex >= offset && p.dayIndex < offset + 7).map((p) => p.dayIndex - offset);
  if (days.length === 0) return "off";
  if (days.length === 7) return "every day";
  // Collapse consecutive runs: [0,1,2,3,4] -> "Mon-Fri".
  const runs: string[] = [];
  let i = 0;
  while (i < days.length) {
    let j = i;
    while (j + 1 < days.length && days[j + 1] === days[j] + 1) j++;
    runs.push(j - i >= 2 ? `${WEEKDAY_SHORT[days[i]]}-${WEEKDAY_SHORT[days[j]]}` : days.slice(i, j + 1).map((d) => WEEKDAY_SHORT[d]).join(", "));
    i = j + 1;
  }
  return runs.join(", ");
}

/** e.g. "Every week: Mon-Fri, 8:00 AM-3:00 PM" or "Alternating weeks -- week 1: Mon-Fri, week 2: off". */
export function describePattern(cycleLengthDays: number, pattern: AvailabilityPatternDay[]): string {
  const sample = pattern[0];
  const timeText =
    sample && sample.startTime && sample.endTime ? `, ${formatClock(sample.startTime)}-${formatClock(sample.endTime)}` : "";
  if (cycleLengthDays <= 7) return `Every week: ${summarizeWeek(pattern, 0)}${timeText}`;
  return `Alternating weeks — week 1: ${summarizeWeek(pattern, 0)}, week 2: ${summarizeWeek(pattern, 7)}${timeText}`;
}

export function formatClock(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Shifts a yyyy-MM-dd by whole days -- used to default an anchor to "this week". */
export function addDaysIso(date: string, days: number): string {
  return format(addDays(parseISO(date), days), "yyyy-MM-dd");
}
