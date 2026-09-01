import { format, parseISO } from "date-fns";

/**
 * D-114: childcare_requests.care_date is a Postgres `date` column, which
 * Supabase returns as a raw "yyyy-MM-dd" string (e.g. "2026-09-01") — never
 * show that raw ISO string to a user. Shared by the household's own People
 * page view, the public (no-auth) accept/decline page, and the request
 * email, so this is the single source of truth for how a care date reads.
 */
export function formatCareDate(isoDate: string): string {
  return format(parseISO(isoDate), "EEE, MMM d");
}
