// D-085 (P3-3): shared month-number <-> label mapping for the activity
// season window UI (activity-form.tsx select options, activities list page
// badge) -- one place, so the form and the display badge always agree.
export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** `month` is 1-12. Returns e.g. "March" for 3. Out-of-range input (should
 * never happen given the DB check constraint) falls back to the raw number
 * so the UI degrades instead of throwing. */
export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? String(month);
}

/** Human-readable season window label, e.g. "Mar\u2013Oct" or "Nov\u2013Feb" (wraps). Never
 * shown for a year-round activity -- callers should check for null first. */
export function seasonWindowLabel(startMonth: number, endMonth: number): string {
  return `${monthName(startMonth).slice(0, 3)}\u2013${monthName(endMonth).slice(0, 3)}`;
}
