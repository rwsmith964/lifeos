import { describe, expect, it } from "vitest";
import {
  computeDaylightWindow,
  daylightOverlapMinutes,
  hasSufficientDaylight,
  isActivityInSeason,
} from "./seasonality";

describe("isActivityInSeason", () => {
  it("is always true for a year-round activity (both months null)", () => {
    expect(isActivityInSeason({ season_start_month: null, season_end_month: null }, new Date("2026-01-15"))).toBe(
      true
    );
    expect(isActivityInSeason({ season_start_month: null, season_end_month: null }, new Date("2026-07-04"))).toBe(
      true
    );
  });

  it("matches a normal (non-wrapping) window", () => {
    const activity = { season_start_month: 3, season_end_month: 10 }; // Mar-Oct
    expect(isActivityInSeason(activity, new Date("2026-03-01"))).toBe(true);
    expect(isActivityInSeason(activity, new Date("2026-06-15"))).toBe(true);
    expect(isActivityInSeason(activity, new Date("2026-10-31"))).toBe(true);
    expect(isActivityInSeason(activity, new Date("2026-02-28"))).toBe(false);
    expect(isActivityInSeason(activity, new Date("2026-11-01"))).toBe(false);
  });

  it("handles a wrap-around window (winter activity spanning Dec-Feb)", () => {
    const activity = { season_start_month: 11, season_end_month: 2 }; // Nov-Feb
    expect(isActivityInSeason(activity, new Date("2026-12-25"))).toBe(true);
    expect(isActivityInSeason(activity, new Date("2026-01-15"))).toBe(true);
    expect(isActivityInSeason(activity, new Date("2026-11-01"))).toBe(true);
    expect(isActivityInSeason(activity, new Date("2026-02-28"))).toBe(true);
    expect(isActivityInSeason(activity, new Date("2026-06-15"))).toBe(false);
  });

  it("treats a single-month window as in-season only that month", () => {
    const activity = { season_start_month: 6, season_end_month: 6 };
    expect(isActivityInSeason(activity, new Date("2026-06-10"))).toBe(true);
    expect(isActivityInSeason(activity, new Date("2026-07-01"))).toBe(false);
  });
});

describe("computeDaylightWindow + daylightOverlapMinutes", () => {
  // Eugene, OR coordinates (this household's area).
  const lat = 44.0521;
  const lng = -123.0868;

  it("returns a sunrise before sunset on a normal day", () => {
    const { sunrise, sunset } = computeDaylightWindow(new Date("2026-06-21T12:00:00-07:00"), lat, lng);
    expect(sunrise.getTime()).toBeLessThan(sunset.getTime());
  });

  it("full overlap when the block is entirely within daylight", () => {
    const daylight = { sunrise: new Date("2026-06-21T05:30:00-07:00"), sunset: new Date("2026-06-21T21:00:00-07:00") };
    const block = { start: new Date("2026-06-21T10:00:00-07:00"), end: new Date("2026-06-21T12:00:00-07:00") };
    expect(daylightOverlapMinutes(block, daylight)).toBe(120);
  });

  it("partial overlap when the block extends past sunset", () => {
    // Midwinter: sunset ~4:30pm, but the fixed waking-hours block runs to 8pm.
    const daylight = { sunrise: new Date("2026-12-21T07:45:00-08:00"), sunset: new Date("2026-12-21T16:30:00-08:00") };
    const block = { start: new Date("2026-12-21T08:00:00-08:00"), end: new Date("2026-12-21T20:00:00-08:00") };
    expect(daylightOverlapMinutes(block, daylight)).toBe(8.5 * 60);
  });

  it("zero overlap when the block is entirely after sunset", () => {
    const daylight = { sunrise: new Date("2026-12-21T07:45:00-08:00"), sunset: new Date("2026-12-21T16:30:00-08:00") };
    const block = { start: new Date("2026-12-21T17:00:00-08:00"), end: new Date("2026-12-21T19:00:00-08:00") };
    expect(daylightOverlapMinutes(block, daylight)).toBe(0);
  });
});

describe("hasSufficientDaylight", () => {
  const daylight = { sunrise: new Date("2026-12-21T07:45:00-08:00"), sunset: new Date("2026-12-21T16:30:00-08:00") };

  it("always passes for an activity that doesn't need daylight", () => {
    const activity = { needs_daylight: false, typical_duration_minutes: 600 };
    expect(hasSufficientDaylight(activity, null, daylight)).toBe(true);
  });

  it("fails a needs_daylight activity with no open block at all", () => {
    const activity = { needs_daylight: true, typical_duration_minutes: 60 };
    expect(hasSufficientDaylight(activity, null, daylight)).toBe(false);
  });

  it("passes when the daylight portion of the block covers the typical duration", () => {
    const activity = { needs_daylight: true, typical_duration_minutes: 120 };
    const block = { start: new Date("2026-12-21T08:00:00-08:00"), end: new Date("2026-12-21T20:00:00-08:00") };
    expect(hasSufficientDaylight(activity, block, daylight)).toBe(true);
  });

  it("fails when the daylight portion of the block is shorter than the typical duration", () => {
    const activity = { needs_daylight: true, typical_duration_minutes: 300 }; // 5 hours, e.g. Oakway golf
    const block = { start: new Date("2026-12-21T15:00:00-08:00"), end: new Date("2026-12-21T20:00:00-08:00") };
    // Daylight only runs to 16:30, so only 1.5h of the block is usable.
    expect(hasSufficientDaylight(activity, block, daylight)).toBe(false);
  });
});
