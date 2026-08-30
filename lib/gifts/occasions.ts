// The occasion scan (Section 7.1): finds upcoming birthdays, anniversaries,
// and fixed-date occasions (Christmas) within a rolling horizon. Pure and
// unit-tested, like leadtime.ts — DB access lives in the caller
// (lib/gifts/suggest.ts).
import { addDays, differenceInCalendarDays, isAfter, isBefore, isLeapYear, startOfDay } from "date-fns";
import type { OccasionType, PersonRow } from "../db/database.types";

export interface MonthDay {
  month: number; // 1-12
  day: number; // 1-31
}

export const CHRISTMAS_MONTH_DAY: MonthDay = { month: 12, day: 25 };

/** Parses just the month/day out of a stored `YYYY-MM-DD` date string —
 * the year is often a placeholder when birth_year_known is false, so it's
 * deliberately never read here. */
const ISO_DATE_PATTERN = /^\d{4}-(\d{2})-(\d{2})$/;

export function extractMonthDay(isoDate: string): MonthDay {
  const match = ISO_DATE_PATTERN.exec(isoDate);
  if (!match) {
    throw new Error(`Expected an ISO date string (YYYY-MM-DD), got "${isoDate}"`);
  }
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`Month/day out of range in "${isoDate}"`);
  }
  return { month, day };
}

function safeLocalDate(year: number, month: number, day: number): Date {
  // Feb 29 on a non-leap year: observe on Feb 28 rather than throwing or
  // silently rolling into March.
  if (month === 2 && day === 29 && !isLeapYear(new Date(year, 0, 1))) {
    return new Date(year, 1, 28);
  }
  return new Date(year, month - 1, day);
}

/** The next calendar occurrence of a month/day, today or in the future. */
export function nextOccurrenceOfMonthDay(monthDay: MonthDay, today: Date): Date {
  const todayStart = startOfDay(today);
  const thisYear = safeLocalDate(today.getFullYear(), monthDay.month, monthDay.day);
  if (isBefore(thisYear, todayStart)) {
    return safeLocalDate(today.getFullYear() + 1, monthDay.month, monthDay.day);
  }
  return thisYear;
}

export interface OccasionCandidate {
  personId: string;
  occasionType: Extract<OccasionType, "birthday" | "anniversary" | "christmas">;
  occasionDate: Date;
}

/**
 * People with relationship_type 'self' are excluded — the gift engine
 * doesn't suggest gifts for yourself.
 */
export function scanUpcomingOccasions(
  people: Pick<PersonRow, "id" | "relationship_type" | "birthdate" | "anniversary" | "is_archived">[],
  today: Date,
  horizonDays: number
): OccasionCandidate[] {
  const horizonEnd = addDays(startOfDay(today), horizonDays);
  const withinHorizon = (date: Date) => !isAfter(date, horizonEnd);

  const candidates: OccasionCandidate[] = [];

  for (const person of people) {
    if (person.is_archived || person.relationship_type === "self") continue;

    if (person.birthdate) {
      const next = nextOccurrenceOfMonthDay(extractMonthDay(person.birthdate), today);
      if (withinHorizon(next)) {
        candidates.push({ personId: person.id, occasionType: "birthday", occasionDate: next });
      }
    }

    if (person.anniversary) {
      const next = nextOccurrenceOfMonthDay(extractMonthDay(person.anniversary), today);
      if (withinHorizon(next)) {
        candidates.push({ personId: person.id, occasionType: "anniversary", occasionDate: next });
      }
    }

    const nextChristmas = nextOccurrenceOfMonthDay(CHRISTMAS_MONTH_DAY, today);
    if (withinHorizon(nextChristmas)) {
      candidates.push({ personId: person.id, occasionType: "christmas", occasionDate: nextChristmas });
    }
  }

  return candidates.sort((a, b) => a.occasionDate.getTime() - b.occasionDate.getTime());
}

// Kept in sync with BIRTHDAY_RECENT_PAST_LOOKBACK_DAYS in
// lib/calendar/birthdays.ts — same "still worth acting on" window, applied
// here to the gift-occasion default instead of the brief's headsUp copy.
// Not imported from there to avoid a circular import (birthdays.ts already
// imports extractMonthDay from this file).
const RECENT_PAST_LOOKBACK_DAYS = 3;

/** The most recent past-or-today calendar occurrence of a month/day. */
function mostRecentOccurrenceOfMonthDay(monthDay: MonthDay, todayStart: Date): Date {
  const thisYear = safeLocalDate(todayStart.getFullYear(), monthDay.month, monthDay.day);
  if (isAfter(thisYear, todayStart)) {
    return safeLocalDate(todayStart.getFullYear() - 1, monthDay.month, monthDay.day);
  }
  return thisYear;
}

/**
 * A birthday/anniversary that fell within the last RECENT_PAST_LOOKBACK_DAYS
 * days takes priority over a farther-off future occasion (e.g. Christmas) —
 * this is what actually catches Cal's case: his birthday (Aug 27) had just
 * passed when this form was opened (Aug 30), so the mathematically nearer
 * *future* occasion was Christmas, four months out, not his birthday a
 * year away. Without this, nearestUpcomingOccasionForPerson would default
 * the "Get gift ideas" form to Christmas for someone who just had an
 * uncelebrated birthday — the opposite of the intended fix.
 */
function recentPastOccasionForPerson(
  person: Pick<PersonRow, "id" | "birthdate" | "anniversary">,
  todayStart: Date
): OccasionCandidate | null {
  const candidates: OccasionCandidate[] = [];

  const consider = (dateString: string | null, occasionType: "birthday" | "anniversary") => {
    if (!dateString) return;
    const occurred = mostRecentOccurrenceOfMonthDay(extractMonthDay(dateString), todayStart);
    const daysAgo = differenceInCalendarDays(todayStart, occurred);
    if (daysAgo >= 0 && daysAgo <= RECENT_PAST_LOOKBACK_DAYS) {
      candidates.push({ personId: person.id, occasionType, occasionDate: occurred });
    }
  };
  consider(person.birthdate, "birthday");
  consider(person.anniversary, "anniversary");

  candidates.sort((a, b) => b.occasionDate.getTime() - a.occasionDate.getTime());
  return candidates[0] ?? null;
}

/**
 * P1-9: the manual "Get gift ideas" form previously hardcoded
 * occasionType="just_because" and occasionDate=today regardless of
 * whether the person had a real upcoming occasion, which is how Cal's
 * suggestions ended up tagged "just_because" instead of "birthday" even
 * though his birthday was days away. This finds the single most relevant
 * real occasion (birthday/anniversary/christmas) for one person to default
 * that form to, instead — preferring a just-passed birthday/anniversary
 * (see recentPastOccasionForPerson) over a farther-off future occasion. A
 * 366-day horizon guarantees at least a Christmas candidate for anyone not
 * archived/self, so this only returns null for an excluded person
 * (archived or 'self').
 */
export function nearestUpcomingOccasionForPerson(
  person: Pick<PersonRow, "id" | "relationship_type" | "birthdate" | "anniversary" | "is_archived">,
  today: Date
): OccasionCandidate | null {
  if (person.is_archived || person.relationship_type === "self") return null;

  const todayStart = startOfDay(today);
  const recentPast = recentPastOccasionForPerson(person, todayStart);
  if (recentPast) return recentPast;

  const candidates = scanUpcomingOccasions([person], todayStart, 366);
  return candidates[0] ?? null;
}
