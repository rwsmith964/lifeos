import { describe, expect, it } from "vitest";
import { buildIcsEventDocument, escapeIcsText } from "./ics-export";
import type { CalendarEventRow } from "../db/database.types";

function event(overrides: Partial<CalendarEventRow> = {}): CalendarEventRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    household_id: "hh-1",
    created_by_person_id: "person-1",
    title: "Dentist appointment",
    description: null,
    starts_at: "2026-09-15T17:00:00.000Z",
    ends_at: "2026-09-15T18:00:00.000Z",
    all_day: false,
    location: null,
    location_lat: null,
    location_lng: null,
    travel_time_before_minutes: null,
    prep_time_before_minutes: null,
    event_type: "family",
    visibility: "household",
    external_source: null,
    external_id: null,
    related_activity_id: null,
    synced_to_account_id: null,
    external_caldav_href: null,
    external_caldav_etag: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("escapeIcsText", () => {
  it("escapes backslashes, semicolons, commas, and newlines per RFC 5545", () => {
    expect(escapeIcsText("Dinner; bring snacks, and\na drink\\ or two")).toBe(
      "Dinner\\; bring snacks\\, and\\na drink\\\\ or two"
    );
  });
});

describe("buildIcsEventDocument", () => {
  it("renders a valid single-VEVENT document for a timed event", () => {
    const ics = buildIcsEventDocument(event());
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain(`UID:${event().id}@lifeos.app`);
    expect(ics).toContain("DTSTART:20260915T170000Z");
    expect(ics).toContain("DTEND:20260915T180000Z");
    expect(ics).toContain("SUMMARY:Dentist appointment");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).not.toContain("DESCRIPTION:");
    expect(ics).not.toContain("LOCATION:");
  });

  it("renders VALUE=DATE for all-day events instead of a UTC datetime", () => {
    const ics = buildIcsEventDocument(event({ all_day: true, starts_at: "2026-12-25T00:00:00.000Z", ends_at: "2026-12-26T00:00:00.000Z" }));
    expect(ics).toContain("DTSTART;VALUE=DATE:20261225");
    expect(ics).toContain("DTEND;VALUE=DATE:20261226");
    expect(ics).not.toContain("DTSTART:2026");
  });

  it("includes description and location when present, escaped", () => {
    const ics = buildIcsEventDocument(event({ description: "Bring; the, form", location: "123 Main St" }));
    expect(ics).toContain("DESCRIPTION:Bring\\; the\\, form");
    expect(ics).toContain("LOCATION:123 Main St");
  });

  it("folds lines longer than 75 octets per RFC 5545", () => {
    const longTitle = "A".repeat(120);
    const ics = buildIcsEventDocument(event({ title: longTitle }));
    const summaryLineStart = ics.indexOf("SUMMARY:");
    const nextCrlf = ics.indexOf("\r\n", summaryLineStart);
    // The first physical line of the folded SUMMARY must be <= 75 octets.
    expect(nextCrlf - summaryLineStart).toBeLessThanOrEqual(75);
    // The continuation line begins with a single leading space, and the full unfolded text is preserved end to end.
    expect(ics).toContain("\r\n A".repeat(1).slice(0, 4));
    expect(ics.replace(/\r\n /g, "")).toContain(longTitle);
  });
});
