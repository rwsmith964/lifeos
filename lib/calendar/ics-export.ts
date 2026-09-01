// Module 4 — the write-side counterpart of ics-import.ts's parser: renders
// one LifeOS calendar_events row as a minimal single-VEVENT .ics document
// for CalDAV PUT. Deliberately narrow (no RRULE, no VALARM, no attendees)
// -- LifeOS-native events created through the app are single occurrences,
// so a push-side recurrence encoder isn't yet load-bearing; see QUEUE-017.
import type { CalendarEventRow } from "../db/database.types";

/** RFC 5545 TEXT value escaping: backslash, semicolon, comma, then literal newlines last (so earlier escapes don't get re-escaped). */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function formatIcsDateTimeUtc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function formatIcsDateOnly(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, "");
}

/**
 * Folds a content line at 75 octets per RFC 5545 §3.1 -- most CalDAV
 * servers tolerate unfolded lines, but Apple's has been observed to
 * reject or mis-parse long unfolded SUMMARY/DESCRIPTION lines, so this
 * folds defensively for every line rather than only when a server
 * complains.
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    parts.push(rest.slice(0, 75));
    rest = " " + rest.slice(75);
  }
  parts.push(rest);
  return parts.join("\r\n");
}

/** Renders one calendar_events row as a complete single-VEVENT .ics document, ready for a CalDAV PUT body. */
export function buildIcsEventDocument(event: CalendarEventRow): string {
  const uid = `${event.id}@lifeos.app`;
  const dtstamp = formatIcsDateTimeUtc(new Date().toISOString());

  const lines: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//LifeOS//Calendar Sync//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${dtstamp}`];

  if (event.all_day) {
    lines.push(`DTSTART;VALUE=DATE:${formatIcsDateOnly(event.starts_at)}`);
    lines.push(`DTEND;VALUE=DATE:${formatIcsDateOnly(event.ends_at)}`);
  } else {
    lines.push(`DTSTART:${formatIcsDateTimeUtc(event.starts_at)}`);
    lines.push(`DTEND:${formatIcsDateTimeUtc(event.ends_at)}`);
  }

  lines.push(`SUMMARY:${escapeIcsText(event.title)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.map(foldLine).join("\r\n") + "\r\n";
}
