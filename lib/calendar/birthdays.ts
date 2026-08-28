// D-062: birthdays auto-populate on the calendar. Deliberately computed at
// render time from `people.birthdate` rather than materialized as real
// `calendar_events` rows -- a person's birthday is a derived fact of their
// birthdate, not an independent schedulable thing, so there's nothing to
// edit/cancel/reschedule and no cron or idempotency bookkeeping needed. Any
// edit to a person's birthdate on their profile is reflected immediately,
// every time the calendar is viewed, with no sync step in between.
import { eachDayOfInterval, isLeapYear, startOfDay } from "date-fns";
import { extractMonthDay, type MonthDay } from "../gifts/occasions";
import type { PersonRow } from "../db/database.types";

export interface BirthdayCalendarItem {
  personId: string;
  personName: string;
  date: Date;
  /** Age they're turning on this occurrence, or null when birth_year_known is false. */
  age: number | null;
}

/** Feb 29 birthdays are observed on Feb 28 in non-leap years -- same rule lib/gifts/occasions.ts already applies for gift-occasion scanning. */
function effectiveMonthDayForYear(monthDay: MonthDay, year: number): MonthDay {
  if (monthDay.month === 2 && monthDay.day === 29 && !isLeapYear(new Date(year, 0, 1))) {
    return { month: 2, day: 28 };
  }
  return monthDay;
}

type BirthdayEligiblePerson = Pick<
  PersonRow,
  "id" | "full_name" | "nickname" | "birthdate" | "birth_year_known" | "is_archived"
>;

/**
 * Every birthday occurrence landing within [rangeStart, rangeEnd] (inclusive,
 * compared by calendar day) across the given people. A person with a
 * birthday can appear more than once if the range spans more than a year.
 * People with relationship_type 'self' are intentionally NOT excluded here
 * (unlike the gift-occasion scan) -- seeing your own birthday on your own
 * calendar is expected; it's the gift-suggestion engine that has no reason
 * to suggest a gift for yourself, not the calendar.
 */
export function birthdaysInRange(
  people: BirthdayEligiblePerson[],
  rangeStart: Date,
  rangeEnd: Date
): BirthdayCalendarItem[] {
  const days = eachDayOfInterval({ start: startOfDay(rangeStart), end: startOfDay(rangeEnd) });
  const items: BirthdayCalendarItem[] = [];

  for (const person of people) {
    if (person.is_archived || !person.birthdate) continue;
    const monthDay = extractMonthDay(person.birthdate);
    const birthYear = person.birth_year_known ? Number(person.birthdate.slice(0, 4)) : null;

    for (const day of days) {
      const effective = effectiveMonthDayForYear(monthDay, day.getFullYear());
      if (day.getMonth() + 1 === effective.month && day.getDate() === effective.day) {
        items.push({
          personId: person.id,
          personName: person.nickname || person.full_name,
          date: day,
          age: birthYear != null ? day.getFullYear() - birthYear : null,
        });
      }
    }
  }

  return items.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function birthdayTitle(item: BirthdayCalendarItem): string {
  return item.age != null ? `${item.personName} turns ${item.age}` : `${item.personName}'s birthday`;
}
