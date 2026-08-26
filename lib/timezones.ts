// Central source of truth for the IANA timezone list used by the
// settings timezone select (replacing a free-text input, Phase 3
// backlog) and for server-side validation of submitted values.
//
// `Intl.supportedValuesOf("timeZone")` is available in Node 18+ and all
// evergreen browsers, so this needs no bundled data file. A small
// hardcoded fallback covers the rare runtime where it's missing.
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
