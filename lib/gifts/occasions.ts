// The occasion scan (Section 7.1): finds upcoming birthdays, anniversaries,
// and fixed-date occasions (Christmas) within a rolling horizon. Pure and
// unit-tested, like leadtime.ts — DB access lives in the caller
// (lib/gifts/suggest.ts).
import { addDays, isAfter, isBefore, isLeapYear, startOfDay } from "date-fns";
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
