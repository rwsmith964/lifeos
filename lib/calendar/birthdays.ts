// D-062: birthdays auto-populate on the calendar. Deliberately computed at
// render time from `people.birthdate` rather than materialized as real
// `calendar_events` rows -- a person's birthday is a derived fact of their
// birthdate, not an independent schedulable thing, so there's nothing to
// edit/cancel/reschedule and no cron or idempotency bookkeeping needed. Any
// edit to a person's birthdate on their profile is reflected immediately,
// every time the calendar is viewed, with no sync step in between.
import { addDays, eachDayOfInterval, isLeapYear, startOfDay, subDays } from "date-fns";
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

// P1-9: the daily brief must surface a birthday at specific lead-time
// milestones counting down to it (30/14/7/3/1 days, and the day itself),
// not silently every day for a month straight -- and it must also catch
// one that *just* happened, since "Cal's birthday was 3 days ago and
// nobody mentioned it" is exactly as useful a heads-up as "in 3 days."
// Reusing the same threshold (3) for both directions is deliberate, not
// an oversight -- it's the one lookback distance already meaningful in
// this list.
export const BIRTHDAY_LEAD_TIME_MILESTONE_DAYS = [30, 14, 7, 3, 1, 0] as const;
export const BIRTHDAY_RECENT_PAST_LOOKBACK_DAYS = 3;

export interface BirthdayLeadTimeItem extends BirthdayCalendarItem {
  /** Positive = upcoming, 0 = today, negative = happened this many days ago. */
  daysUntil: number;
}

/**
 * Every person whose (next-or-just-passed) birthday sits on one of the
 * forward milestones or within the recent-past lookback, as of `today`.
 * Deliberately NOT every day in between -- a brief that mentions the same
 * upcoming birthday every single day for a month trains the user to
 * ignore it, same reasoning as the order-by prompt-window buffer
 * (lib/gifts/leadtime.ts).
 */
export function birthdaysToSurfaceInBrief(
  people: BirthdayEligiblePerson[],
  today: Date
): BirthdayLeadTimeItem[] {
  const todayStart = startOfDay(today);
  const maxLead = Math.max(...BIRTHDAY_LEAD_TIME_MILESTONE_DAYS);
  const rangeStart = subDays(todayStart, BIRTHDAY_RECENT_PAST_LOOKBACK_DAYS);
  const rangeEnd = addDays(todayStart, maxLead);

  const results: BirthdayLeadTimeItem[] = [];
  for (const item of birthdaysInRange(people, rangeStart, rangeEnd)) {
    const daysUntil = Math.round((startOfDay(item.date).getTime() - todayStart.getTime()) / 86_400_000);
    const isMilestone = (BIRTHDAY_LEAD_TIME_MILESTONE_DAYS as readonly number[]).includes(daysUntil);
    const isRecentPast = daysUntil < 0 && daysUntil >= -BIRTHDAY_RECENT_PAST_LOOKBACK_DAYS;
    if (isMilestone || isRecentPast) {
      results.push({ ...item, daysUntil });
    }
  }

  return results.sort((a, b) => a.daysUntil - b.daysUntil);
}

/** e.g. "in 30 days", "today", "3 days ago". No raw ISO dates, per the spec's UI-facing rule. */
export function birthdayLeadTimeLabel(daysUntil: number): string {
  if (daysUntil === 0) return "today";
  if (daysUntil === 1) return "tomorrow";
  if (daysUntil > 0) return `in ${daysUntil} days`;
  const daysAgo = Math.abs(daysUntil);
  return daysAgo === 1 ? "yesterday" : `${daysAgo} days ago`;
}
