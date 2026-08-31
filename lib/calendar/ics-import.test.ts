import { describe, expect, it } from "vitest";
import { externalSourceForFeed, isSafeFeedUrl, parseIcsFeed } from "./ics-import";

function ics(...vevents: string[]): string {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Test//Test//EN", ...vevents, "END:VCALENDAR"].join("\r\n");
}

describe("parseIcsFeed", () => {
  it("parses a single non-recurring event inside the window", () => {
    const feed = ics(
      [
        "BEGIN:VEVENT",
        "UID:single-1@example.com",
        "DTSTAMP:20260101T000000Z",
        "DTSTART:20260305T170000Z",
        "DTEND:20260305T180000Z",
        "SUMMARY:Dentist appointment",
        "END:VEVENT",
      ].join("\r\n")
    );

    const occurrences = parseIcsFeed(feed, new Date("2026-03-01T00:00:00Z"), new Date("2026-03-31T00:00:00Z"));

    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]).toMatchObject({
      externalId: "single-1@example.com",
      title: "Dentist appointment",
      allDay: false,
    });
    expect(occurrences[0].startsAt.toISOString()).toBe("2026-03-05T17:00:00.000Z");
    expect(occurrences[0].endsAt.toISOString()).toBe("2026-03-05T18:00:00.000Z");
  });

  it("drops a single event entirely outside the window", () => {
    const feed = ics(
      [
        "BEGIN:VEVENT",
        "UID:outside-1@example.com",
        "DTSTAMP:20260101T000000Z",
        "DTSTART:20260101T170000Z",
        "DTEND:20260101T180000Z",
        "SUMMARY:Old event",
        "END:VEVENT",
      ].join("\r\n")
    );

    const occurrences = parseIcsFeed(feed, new Date("2026-03-01T00:00:00Z"), new Date("2026-03-31T00:00:00Z"));
    expect(occurrences).toHaveLength(0);
  });

  it("expands a weekly recurring event into every occurrence in the window", () => {
    const feed = ics(
      [
        "BEGIN:VEVENT",
        "UID:weekly-1@example.com",
        "DTSTAMP:20260101T000000Z",
        "DTSTART:20260302T190000Z",
        "DTEND:20260302T200000Z",
        "RRULE:FREQ=WEEKLY;BYDAY=MO",
        "SUMMARY:Soccer practice",
        "END:VEVENT",
      ].join("\r\n")
    );

    // A 3-week window starting on the first occurrence should yield exactly 3 Mondays.
    const occurrences = parseIcsFeed(feed, new Date("2026-03-02T00:00:00Z"), new Date("2026-03-23T00:00:00Z"));

    expect(occurrences).toHaveLength(3);
    expect(occurrences.every((o) => o.title === "Soccer practice")).toBe(true);
    expect(occurrences.map((o) => o.startsAt.toISOString())).toEqual([
      "2026-03-02T19:00:00.000Z",
      "2026-03-09T19:00:00.000Z",
      "2026-03-16T19:00:00.000Z",
    ]);
    expect(occurrences[0].externalId).toBe("weekly-1@example.com:2026-03-02T19:00:00.000Z");
  });

  it("detects an all-day event via DATE-valued DTSTART/DTEND", () => {
    const feed = ics(
      [
        "BEGIN:VEVENT",
        "UID:allday-1@example.com",
        "DTSTAMP:20260101T000000Z",
        "DTSTART;VALUE=DATE:20260310",
        "DTEND;VALUE=DATE:20260311",
        "SUMMARY:School holiday",
        "END:VEVENT",
      ].join("\r\n")
    );

    const occurrences = parseIcsFeed(feed, new Date("2026-03-01T00:00:00Z"), new Date("2026-03-31T00:00:00Z"));
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].allDay).toBe(true);
  });

  it("excludes an EXDATE occurrence from a recurring event", () => {
    const feed = ics(
      [
        "BEGIN:VEVENT",
        "UID:weekly-exdate@example.com",
        "DTSTAMP:20260101T000000Z",
        "DTSTART:20260302T190000Z",
        "DTEND:20260302T200000Z",
        "RRULE:FREQ=WEEKLY;BYDAY=MO",
        "EXDATE:20260309T190000Z",
        "SUMMARY:Soccer practice",
        "END:VEVENT",
      ].join("\r\n")
    );

    const occurrences = parseIcsFeed(feed, new Date("2026-03-02T00:00:00Z"), new Date("2026-03-23T00:00:00Z"));

    expect(occurrences.map((o) => o.startsAt.toISOString())).toEqual([
      "2026-03-02T19:00:00.000Z",
      "2026-03-16T19:00:00.000Z",
    ]);
  });

  it("applies a RECURRENCE-ID override for a single moved/modified instance", () => {
    const feed = ics(
      [
        "BEGIN:VEVENT",
        "UID:weekly-override@example.com",
        "DTSTAMP:20260101T000000Z",
        "DTSTART:20260302T190000Z",
        "DTEND:20260302T200000Z",
        "RRULE:FREQ=WEEKLY;BYDAY=MO",
        "SUMMARY:Soccer practice",
        "END:VEVENT",
      ].join("\r\n"),
      [
        "BEGIN:VEVENT",
        "UID:weekly-override@example.com",
        "DTSTAMP:20260101T000000Z",
        "RECURRENCE-ID:20260309T190000Z",
        "DTSTART:20260309T210000Z",
        "DTEND:20260309T220000Z",
        "SUMMARY:Soccer practice (moved to 9pm)",
        "END:VEVENT",
      ].join("\r\n")
    );

    const occurrences = parseIcsFeed(feed, new Date("2026-03-02T00:00:00Z"), new Date("2026-03-23T00:00:00Z"));
    const moved = occurrences.find((o) => o.startsAt.toISOString() === "2026-03-09T21:00:00.000Z");

    expect(moved).toBeDefined();
    expect(moved?.title).toBe("Soccer practice (moved to 9pm)");
    // The other two Mondays are untouched.
    expect(occurrences).toHaveLength(3);
  });
});

describe("externalSourceForFeed", () => {
  it("namespaces a feed id under the ical: prefix", () => {
    expect(externalSourceForFeed("abc-123")).toBe("ical:abc-123");
  });
});

describe("isSafeFeedUrl", () => {
  it("accepts a plain https calendar URL", () => {
    expect(isSafeFeedUrl("https://calendar.google.com/calendar/ical/abc/basic.ics")).toEqual({ safe: true });
  });

  it("accepts a plain http calendar URL", () => {
    expect(isSafeFeedUrl("http://example.com/calendar.ics")).toEqual({ safe: true });
  });

  it("rejects a non-http(s) scheme", () => {
    const result = isSafeFeedUrl("ftp://example.com/calendar.ics");
    expect(result.safe).toBe(false);
  });

  it("rejects an unparseable URL", () => {
    const result = isSafeFeedUrl("not a url");
    expect(result.safe).toBe(false);
  });

  it("rejects localhost", () => {
    expect(isSafeFeedUrl("http://localhost:3000/calendar.ics").safe).toBe(false);
  });

  it("rejects loopback IPv4", () => {
    expect(isSafeFeedUrl("http://127.0.0.1/calendar.ics").safe).toBe(false);
  });

  it("rejects private-range 10.x IPv4", () => {
    expect(isSafeFeedUrl("http://10.0.0.5/calendar.ics").safe).toBe(false);
  });

  it("rejects private-range 172.16-31.x IPv4", () => {
    expect(isSafeFeedUrl("http://172.20.0.5/calendar.ics").safe).toBe(false);
  });

  it("rejects private-range 192.168.x IPv4", () => {
    expect(isSafeFeedUrl("http://192.168.1.5/calendar.ics").safe).toBe(false);
  });

  it("rejects link-local 169.254.x IPv4 (cloud metadata endpoints)", () => {
    expect(isSafeFeedUrl("http://169.254.169.254/latest/meta-data").safe).toBe(false);
  });

  it("rejects IPv6 loopback", () => {
    expect(isSafeFeedUrl("http://[::1]/calendar.ics").safe).toBe(false);
  });

  it("accepts a public IPv4 host", () => {
    expect(isSafeFeedUrl("http://93.184.216.34/calendar.ics").safe).toBe(true);
  });
});
