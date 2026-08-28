import { describe, expect, it } from "vitest";
import { bestDaytimePeriodForDate } from "./detect";
import type { NwsForecastPeriod } from "../external/nws";

function makePeriod(name: string, startTime: string, endTime: string): NwsForecastPeriod {
  return {
    name,
    startTime,
    endTime,
    temperatureF: 70,
    windSpeed: "5 mph",
    shortForecast: "Sunny",
    precipitationChancePercent: 0,
  };
}

describe("bestDaytimePeriodForDate", () => {
  // Sat Aug 29, 2026, Pacific offset -07:00 for all fixtures below.
  const targetDate = new Date(2026, 7, 29);

  it("picks the daytime period when it fully covers waking hours", () => {
    const periods = [
      makePeriod("Friday Night", "2026-08-28T18:00:00-07:00", "2026-08-29T06:00:00-07:00"),
      makePeriod("Saturday", "2026-08-29T06:00:00-07:00", "2026-08-29T18:00:00-07:00"),
      makePeriod("Saturday Night", "2026-08-29T18:00:00-07:00", "2026-08-30T06:00:00-07:00"),
    ];
    const best = bestDaytimePeriodForDate(periods, targetDate);
    expect(best?.name).toBe("Saturday");
  });

  it("picks whichever period overlaps waking hours more when neither fully covers it", () => {
    // A short daytime period (8am-2pm, 6hrs of the 8am-8pm window) versus
    // the overnight period only touching the last hour (7pm-8pm) --
    // daytime should still win despite neither being a full match.
    const periods = [
      makePeriod("Saturday", "2026-08-29T08:00:00-07:00", "2026-08-29T14:00:00-07:00"),
      makePeriod("Saturday Night", "2026-08-29T19:00:00-07:00", "2026-08-30T07:00:00-07:00"),
    ];
    const best = bestDaytimePeriodForDate(periods, targetDate);
    expect(best?.name).toBe("Saturday");
  });

  it("returns null when no period overlaps the target date at all", () => {
    const periods = [
      makePeriod("Next Monday", "2026-09-01T06:00:00-07:00", "2026-09-01T18:00:00-07:00"),
    ];
    expect(bestDaytimePeriodForDate(periods, targetDate)).toBeNull();
  });

  it("returns null for an empty periods list", () => {
    expect(bestDaytimePeriodForDate([], targetDate)).toBeNull();
  });
});
