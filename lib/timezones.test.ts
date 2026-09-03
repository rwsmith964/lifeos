import { describe, expect, it, vi, afterEach } from "vitest";
import { format, startOfDay } from "date-fns";
import { getZonedNow, isValidTimezone } from "./timezones";

describe("getZonedNow", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("D-143: returns the household's local calendar date even when the UTC date has already rolled over", () => {
    // 2026-09-02 19:49 PDT == 2026-09-03 02:49 UTC -- the exact D-143 bug
    // report (calendar showed 9/3 while it was still 9/2 evening in
    // America/Los_Angeles). A bare `new Date()` read as "today" on a
    // UTC-timezone server (Vercel Serverless Functions, and this sandbox)
    // would format as 2026-09-03; getZonedNow must still say 2026-09-02.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T02:49:00.000Z"));

    const zonedNow = getZonedNow("America/Los_Angeles");
    expect(format(startOfDay(zonedNow), "yyyy-MM-dd")).toBe("2026-09-02");
    expect(zonedNow.toISOString().slice(0, 10)).toBe("2026-09-02");
  });

  it("agrees with UTC when the timezone is UTC", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T02:49:00.000Z"));

    const zonedNow = getZonedNow("UTC");
    expect(format(startOfDay(zonedNow), "yyyy-MM-dd")).toBe("2026-09-03");
  });

  it("rolls forward for a timezone ahead of UTC", () => {
    // 2026-09-02 23:10 UTC is already 2026-09-03 08:10 in Asia/Tokyo (+9).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T23:10:00.000Z"));

    const zonedNow = getZonedNow("Asia/Tokyo");
    expect(format(startOfDay(zonedNow), "yyyy-MM-dd")).toBe("2026-09-03");
  });
});

describe("isValidTimezone", () => {
  it("still accepts real IANA zones and rejects garbage (unchanged behavior)", () => {
    expect(isValidTimezone("America/Los_Angeles")).toBe(true);
    expect(isValidTimezone("not-a-timezone")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
  });
});
