// Central source of truth for the IANA timezone list used by the
// settings timezone select (replacing a free-text input, Phase 3
// backlog) and for server-side validation of submitted values.
//
// `Intl.supportedValuesOf("timeZone")` is available in Node 18+ and all
// evergreen browsers, so this needs no bundled data file. A small
// hardcoded fallback covers the rare runtime where it's missing.
import { toZonedTime } from "date-fns-tz";

const FALLBACK_TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Anchorage",
  "Pacific/Honolulu",
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
];

let cachedZones: string[] | null = null;

export function getTimezoneOptions(): string[] {
  if (cachedZones) return cachedZones;
  try {
    cachedZones = Intl.supportedValuesOf("timeZone");
  } catch {
    cachedZones = FALLBACK_TIMEZONES;
  }
  return cachedZones;
}

export function isValidTimezone(value: string): boolean {
  if (!value) return false;
  try {
    // Constructing a DateTimeFormat with an unknown zone throws
    // synchronously — cheaper and more portable than checking list
    // membership, and correctly accepts any zone the runtime supports
    // even if it's missing from the fallback list above.
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

// D-143: single source of truth for "what is 'today' for this person".
// Vercel Serverless Functions (and this sandbox) run Node with no TZ
// override, i.e. the process's system timezone is UTC -- every date-fns
// call (startOfDay, isToday, format, ...) reads wall-clock components via
// that system timezone. Before this helper, every "today" computation on
// the server used `new Date()` directly, which is a UTC instant: any user
// west of UTC sees tomorrow's date after their local evening rolls past
// midnight UTC (e.g. 7pm PDT is already 2am UTC the next day) -- exactly
// the D-143 bug report (calendar showing 9/3 at 7:49pm PDT on 9/2).
//
// `toZonedTime` shifts the real UTC instant by `timezone`'s offset, so the
// returned Date's (UTC-read) components equal the wall-clock date/time in
// that zone. Passing this Date into ordinary date-fns functions then
// produces the correct local day everywhere, with no per-call-site
// timezone math. Always call this with the household/user's stored
// `timezone` (never a bare `new Date()`) for any "what day is today"
// decision -- calendar defaults, weekend-plan lookup, daily brief
// generation, "today" quick-actions, and future-date validation.
export function getZonedNow(timezone: string): Date {
  return toZonedTime(new Date(), timezone);
}
