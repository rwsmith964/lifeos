import { describe, expect, it } from "vitest";
import { busyDatesForPerson, expandAvailability, type AvailabilityScheduleLike } from "./expand";

function schedule(overrides: Partial<AvailabilityScheduleLike> = {}): AvailabilityScheduleLike {
  return {
    id: "s1",
    person_id: "brittney",
    kind: "busy",
    label: "Her kids' week",
    cycle_length_days: 14,
    // Week A (days 0-6): Monday-Friday busy. Week B: nothing. Anchor is a Monday.
    pattern: [0, 1, 2, 3, 4].map((dayIndex) => ({ dayIndex, startTime: null, endTime: null })),
    anchor_date: "2026-11-02",
    start_date: "2026-11-02",
    end_date: null,
    skip_ranges: [],
    ...overrides,
  };
}

const datesOf = (s: AvailabilityScheduleLike, from: Date, to: Date) => expandAvailability(s, from, to).map((o) => o.date);

describe("expandAvailability", () => {
  it("covers the active week and skips the off week of an alternating pattern", () => {
    const dates = datesOf(schedule(), new Date(2026, 10, 2), new Date(2026, 10, 22));
    expect(dates).toEqual([
      "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06",
      "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20",
    ]);
  });

  it("repeats weekly when the cycle is 7 days", () => {
    const weekly = schedule({ cycle_length_days: 7 });
    const dates = datesOf(weekly, new Date(2026, 10, 2), new Date(2026, 10, 15));
    expect(dates).toHaveLength(10);
    expect(dates).toContain("2026-11-09");
  });

  it("works for dates before the anchor (negative day offsets)", () => {
    const dates = datesOf(schedule({ start_date: "2026-10-01" }), new Date(2026, 9, 19), new Date(2026, 9, 25));
    // Oct 19-23 is two weeks before the anchor week, so it is also an active week.
    expect(dates).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]);
  });

  it("respects start and end dates", () => {
    const dates = datesOf(schedule({ start_date: "2026-11-03", end_date: "2026-11-05" }), new Date(2026, 10, 1), new Date(2026, 10, 30));
    expect(dates).toEqual(["2026-11-03", "2026-11-04", "2026-11-05"]);
  });

  it("leaves out skipped ranges such as a school break or a week she is free", () => {
    const skipped = schedule({ skip_ranges: [{ start: "2026-11-03", end: "2026-11-04", label: "free" }] });
    const dates = datesOf(skipped, new Date(2026, 10, 2), new Date(2026, 10, 6));
    expect(dates).toEqual(["2026-11-02", "2026-11-05", "2026-11-06"]);
  });

  it("carries a school day's times through", () => {
    const school = schedule({
      kind: "school",
      cycle_length_days: 7,
      pattern: [0, 1, 2, 3, 4].map((dayIndex) => ({ dayIndex, startTime: "08:00", endTime: "15:00" })),
    });
    const [first] = expandAvailability(school, new Date(2026, 10, 2), new Date(2026, 10, 2));
    expect(first).toMatchObject({ date: "2026-11-02", startTime: "08:00", endTime: "15:00", kind: "school" });
  });
});

describe("busyDatesForPerson", () => {
  it("only counts that person's busy schedules, not school or someone else's", () => {
    const hers = schedule();
    const hersSchool = schedule({ id: "s2", kind: "school" });
    const someoneElse = schedule({ id: "s3", person_id: "other" });
    const busy = busyDatesForPerson([hers, hersSchool, someoneElse], "brittney", new Date(2026, 10, 2), new Date(2026, 10, 8));
    expect([...busy].sort()).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]);
  });
});
