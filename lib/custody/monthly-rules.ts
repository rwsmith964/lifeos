// Repeating variations to a custody schedule: "the other parent has the kids
// on the first Saturday of the month." Pure date math -- expands rules into
// the concrete { date -> responsible parent } overrides the generator already
// understands (the same shape as single-date exceptions).
import { format, getDay, getDaysInMonth } from "date-fns";

export type MonthlyOrdinal = 1 | 2 | 3 | 4 | -1;

export interface MonthlyRuleLike {
  ordinal: number;
  day_of_week: number;
  responsible_person_id: string;
}

export const ORDINAL_LABELS: Record<MonthlyOrdinal, string> = {
  1: "first",
  2: "second",
  3: "third",
  4: "fourth",
  [-1]: "last",
};

export const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export function describeMonthlyRule(rule: Pick<MonthlyRuleLike, "ordinal" | "day_of_week">): string {
  const ordinal = ORDINAL_LABELS[rule.ordinal as MonthlyOrdinal] ?? `#${rule.ordinal}`;
  return `${ordinal} ${WEEKDAY_LABELS[rule.day_of_week] ?? "?"} of every month`;
}

/** The date of the nth (or last) given weekday in a month, or null if that month has none. */
export function nthWeekdayOfMonth(year: number, monthIndex: number, dayOfWeek: number, ordinal: number): Date | null {
  const first = new Date(year, monthIndex, 1);
  const daysInMonth = getDaysInMonth(first);
  if (ordinal === -1) {
    for (let day = daysInMonth; day >= 1; day--) {
      const candidate = new Date(year, monthIndex, day);
      if (getDay(candidate) === dayOfWeek) return candidate;
    }
    return null;
  }
  const offset = (dayOfWeek - getDay(first) + 7) % 7;
  const day = 1 + offset + (ordinal - 1) * 7;
  return day <= daysInMonth ? new Date(year, monthIndex, day) : null;
}

/**
 * Every date in [windowStart, windowEnd] (inclusive, by calendar day) that a
 * rule lands on, as yyyy-MM-dd -> responsible parent. When two rules hit the
 * same day (e.g. "fourth Saturday" and "last Saturday" in a 4-Saturday
 * month), the one listed later wins, so callers control precedence by order.
 */
export function expandMonthlyRules(rules: MonthlyRuleLike[], windowStart: Date, windowEnd: Date): Map<string, string> {
  const result = new Map<string, string>();
  const startDay = new Date(windowStart.getFullYear(), windowStart.getMonth(), windowStart.getDate());
  const endDay = new Date(windowEnd.getFullYear(), windowEnd.getMonth(), windowEnd.getDate());

  let cursor = new Date(startDay.getFullYear(), startDay.getMonth(), 1);
  while (cursor <= endDay) {
    for (const rule of rules) {
      const date = nthWeekdayOfMonth(cursor.getFullYear(), cursor.getMonth(), rule.day_of_week, rule.ordinal);
      if (date && date >= startDay && date <= endDay) {
        result.set(format(date, "yyyy-MM-dd"), rule.responsible_person_id);
      }
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return result;
}
