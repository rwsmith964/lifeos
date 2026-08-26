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

/**
 * D-048: don't tell the user to reach out to someone they're already
 * scheduled to see today — e.g. an overdue-contact nudge for a co-parent who
 * has a custody handover this afternoon, or a friend already on today's
 * calendar via a shared activity. `seenTodayPersonIds` is computed by the
 * caller (lib/brief/generate.ts) from today's custody blocks and today's
 * events' related-activity companions; kept as a plain Set param here so
 * this stays a pure, DB-free, unit-testable filter like the rest of this
 * module.
 */
export function suppressCadencesSeenToday<T extends { personId: K }, K extends string | number>(
  overdueContacts: T[],
  seenTodayPersonIds: ReadonlySet<K>
): T[] {
  return overdueContacts.filter((c) => !seenTodayPersonIds.has(c.personId));
}
