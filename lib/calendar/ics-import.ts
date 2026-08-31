// P3-6: calendar import (Google Calendar / iCal). Google Calendar (and
// every other mainstream calendar app) exposes a "secret address in iCal
// format" for each calendar -- a plain HTTPS .ics URL, unguessable but
// unauthenticated, meant to be pasted into another app. That means this
// feature needs no OAuth app registration, client ID/secret, or Google
// Cloud project (unlike, say, two-way write-back to Google Calendar) --
// just an HTTP GET and an RFC 5545 parse, both of which this module does
// for real. Kept pure/testable here; the network fetch and DB writes live
// in lib/calendar/feed-sync.ts.
import ical, { type VEvent } from "node-ical";

// node-ical types `recurrences` as `Record<string, Omit<VEvent, "recurrences">>`,
// but VEvent's own index signature (from BaseComponent) makes TypeScript's
// `Omit` collapse the specific field types it removes down to `{}` --
// naming just the fields this module actually reads sidesteps that rather
// than fighting the library's types.
interface RecurrenceOverride {
  start?: Date;
  end?: Date;
  summary?: VEvent["summary"];
}
type ParsedVEvent = VEvent & {
  recurrences?: Record<string, RecurrenceOverride>;
};

export const IMPORT_WINDOW_DAYS = 90;
export const MAX_FEED_BYTES = 5 * 1024 * 1024; // 5 MB -- a personal calendar's .ics is a few KB to a few hundred KB; anything past 5MB is not a personal calendar feed.
export const FEED_FETCH_TIMEOUT_MS = 15_000;

export interface ImportedOccurrence {
  /** Stable per-occurrence key, unique within one feed: `<uid>` for a single event, `<uid>:<occurrence ISO>` for one instance of a recurring one. */
  externalId: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
}

/**
 * Parse raw .ics text into concrete occurrences that fall (at least
 * partly) within [windowStart, windowEnd) -- non-recurring VEVENTs pass
 * through as-is, recurring ones (RRULE) are expanded via the `rrule`
 * library node-ical wraps, honoring EXDATE exclusions and per-instance
 * RECURRENCE-ID overrides (e.g. "this Tuesday's practice moved to 7pm").
 * Malformed/unparseable input throws -- the caller (feed-sync) is
 * responsible for turning that into a recorded sync error rather than an
 * unhandled crash.
 */
export function parseIcsFeed(icsText: string, windowStart: Date, windowEnd: Date): ImportedOccurrence[] {
  const parsed = ical.sync.parseICS(icsText);
  const occurrences: ImportedOccurrence[] = [];

  for (const key of Object.keys(parsed)) {
    const event = parsed[key];
    if (!event || event.type !== "VEVENT") continue;
    const vevent = event as ParsedVEvent;
    if (!vevent.start || !vevent.end) continue;

    const allDay = isDateOnly(vevent);
    const title = summaryText(vevent.summary) || "Busy";

    if (!vevent.rrule) {
      const start = new Date(vevent.start);
      const end = new Date(vevent.end);
      if (end > windowStart && start < windowEnd) {
        occurrences.push({ externalId: vevent.uid ?? key, title, startsAt: start, endsAt: end, allDay });
      }
      continue;
    }

    const durationMs = new Date(vevent.end).getTime() - new Date(vevent.start).getTime();
    const exdateKeys = new Set(Object.keys(vevent.exdate ?? {}));
    const recurrences = vevent.recurrences ?? {};

    let dates: Date[];
    try {
      dates = vevent.rrule.between(windowStart, windowEnd, true);
    } catch {
      // A malformed RRULE on one event shouldn't take the whole feed down
      // -- skip just this event's recurrence expansion.
      continue;
    }

    for (const date of dates) {
      const isoKey = date.toISOString();
      if (exdateKeys.has(isoKey)) continue;

      const override = recurrences[isoKey];
      const occStart = override?.start ? new Date(override.start) : date;
      const occEnd = override?.end ? new Date(override.end) : new Date(date.getTime() + durationMs);
      const occTitle = summaryText(override?.summary) || title;

      occurrences.push({
        externalId: `${vevent.uid ?? key}:${isoKey}`,
        title: occTitle,
        startsAt: occStart,
        endsAt: occEnd,
        allDay,
      });
    }
  }

  return occurrences;
}

function isDateOnly(vevent: ParsedVEvent): boolean {
  return vevent.datetype === "date";
}

/** SUMMARY can come through as a plain string or `{ val, params }` when the ICS line carried parameters (e.g. LANGUAGE) -- always resolve to the text either way. */
function summaryText(value: VEvent["summary"] | undefined): string {
  if (!value) return "";
  const raw = typeof value === "string" ? value : value.val;
  return raw?.toString().trim() ?? "";
}

/** The `external_source` tag every calendar_events row from one feed shares -- shared by feed-sync's write and its resync-time cleanup delete. */
export function externalSourceForFeed(feedId: string): string {
  return `ical:${feedId}`;
}

const BLOCKED_HOSTNAMES = new Set(["localhost", "0.0.0.0"]);

/**
 * Basic SSRF guard for a household-supplied feed URL before the server
 * fetches it: only plain http(s), and reject the obvious loopback/
 * link-local/private-network literals a request should never be allowed
 * to target from a server-side fetch. Not a full DNS-rebinding defense
 * (this doesn't resolve the hostname), but it stops the direct,
 * unsophisticated cases of pointing the import at internal
 * infrastructure -- calendar URLs are meant to be public reachable
 * endpoints, so this class of address should never legitimately appear
 * here.
 */
export function isSafeFeedUrl(rawUrl: string): { safe: true } | { safe: false; reason: string } {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { safe: false, reason: "That doesn't look like a valid URL." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { safe: false, reason: "The calendar URL must start with http:// or https://." };
  }
  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { safe: false, reason: "That address can't be used as a calendar feed." };
  }
  if (isPrivateOrLoopbackIpLiteral(hostname)) {
    return { safe: false, reason: "That address can't be used as a calendar feed." };
  }
  return { safe: true };
}

function isPrivateOrLoopbackIpLiteral(hostname: string): boolean {
  // IPv4 literal check -- 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12,
  // 192.168.0.0/16, 169.254.0.0/16 (link-local, includes cloud metadata
  // endpoints like 169.254.169.254).
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }
  // IPv6 loopback / link-local literal. Node's URL#hostname keeps the
  // brackets for an IPv6 literal (e.g. "[::1]", "[fe80::1]"), so strip
  // them before comparing.
  const bracketless = hostname.replace(/^\[|\]$/g, "");
  if (bracketless === "::1" || bracketless.startsWith("fe80:")) return true;
  return false;
}
