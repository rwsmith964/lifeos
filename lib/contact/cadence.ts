// Contact cadence overdue calculation (Section 12.7 — explicitly required
// unit-tested logic). Pure: no DB access. "You haven't golfed with Mike
// since April" (Section 2.3) is this function plus a date formatter.
import { differenceInCalendarDays, parseISO } from "date-fns";
import type { ContactCadenceRow } from "../db/database.types";

export interface CadenceStatus {
  isOverdue: boolean;
  /** null if there is no recorded last contact at all. */
  daysSinceLastContact: number | null;
}

export function evaluateCadence(
  cadence: Pick<ContactCadenceRow, "target_interval_days" | "last_contact_date">,
  today: Date
): CadenceStatus {
  if (!cadence.last_contact_date) {
    return { isOverdue: true, daysSinceLastContact: null };
  }
  const daysSinceLastContact = differenceInCalendarDays(today, parseISO(cadence.last_contact_date));
  return {
    isOverdue: daysSinceLastContact >= cadence.target_interval_days,
    daysSinceLastContact,
  };
}

/** Filters + sorts (most overdue first) — what the brief/planner actually consume. */
export function findOverdueCadences<T extends Pick<ContactCadenceRow, "target_interval_days" | "last_contact_date">>(
  cadences: T[],
  today: Date
): (T & CadenceStatus)[] {
  return cadences
    .map((cadence) => ({ ...cadence, ...evaluateCadence(cadence, today) }))
    .filter((c) => c.isOverdue)
    .sort((a, b) => (b.daysSinceLastContact ?? Infinity) - (a.daysSinceLastContact ?? Infinity));
}
