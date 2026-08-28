import { describe, expect, it } from "vitest";
import { timeOffInRange, timeOffTitle, workShiftsInRange, workShiftTitle } from "./work-schedule";

const RICHARD = { id: "person-1", full_name: "Richard Smith", nickname: null };

function makeSchedule(overrides: Partial<Parameters<typeof workShiftsInRange>[0][number]> = {}) {
  return {
    id: "schedule-1",
    person_id: "person-1",
    day_of_week: 3, // Wednesday
    start_time: "09:00",
    end_time: "17:00",
    label: "Work",
    ...overrides,
  };
}

describe("workShiftsInRange", () => {
  it("generates one occurrence per matching day of week in the range", () => {
    // Aug 26-Sep 1, 2026: Wed Aug 26 and Wed Sep 2 is out of range, so only one Wednesday.
    const items = workShiftsInRange([makeSchedule()], [], [RICHARD], new Date(2026, 7, 26), new Date(2026, 8, 1));
    expect(items).toHaveLength(1);
    expect(items[0].date.getDate()).toBe(26);
    expect(items[0].personName).toBe("Richard Smith");
  });

  it("generates multiple occurrences across several weeks", () => {
    const items = workShiftsInRange([makeSchedule()], [], [RICHARD], new Date(2026, 7, 1), new Date(2026, 7, 31));
    // Wednesdays in August 2026: 5, 12, 19, 26
    expect(items).toHaveLength(4);
  });

  it("skips a shift on a day covered by time off for that person", () => {
    const items = workShiftsInRange(
      [makeSchedule()],
      [{ id: "timeoff-1", person_id: "person-1", start_date: "2026-08-26", end_date: "2026-08-26", reason: "Vacation" }],
      [RICHARD],
      new Date(2026, 7, 26),
      new Date(2026, 7, 26)
    );
    expect(items).toHaveLength(0);
  });

  it("does not suppress another person's shift on the same day", () => {
    const other = { id: "person-2", full_name: "Alex Smith", nickname: null };
    const items = workShiftsInRange(
      [makeSchedule(), makeSchedule({ id: "schedule-2", person_id: "person-2" })],
      [{ id: "timeoff-2", person_id: "person-1", start_date: "2026-08-26", end_date: "2026-08-26", reason: "" }],
      [RICHARD, other],
      new Date(2026, 7, 26),
      new Date(2026, 7, 26)
    );
    expect(items).toHaveLength(1);
    expect(items[0].personId).toBe("person-2");
  });

  it("returns nothing for a person with no work_schedules rows", () => {
    const items = workShiftsInRange([], [], [RICHARD], new Date(2026, 7, 1), new Date(2026, 7, 31));
    expect(items).toHaveLength(0);
  });
});

describe("workShiftTitle", () => {
  it("formats a 24-hour range as 12-hour AM/PM", () => {
    const [item] = workShiftsInRange([makeSchedule()], [], [RICHARD], new Date(2026, 7, 26), new Date(2026, 7, 26));
    expect(workShiftTitle(item)).toBe("Richard Smith: Work 9 AM\u20135 PM");
  });

  it("includes minutes when not on the hour", () => {
    const [item] = workShiftsInRange(
      [makeSchedule({ start_time: "08:30", end_time: "16:45" })],
      [],
      [RICHARD],
      new Date(2026, 7, 26),
      new Date(2026, 7, 26)
    );
    expect(workShiftTitle(item)).toBe("Richard Smith: Work 8:30 AM\u20134:45 PM");
  });
});

describe("timeOffInRange", () => {
  it("expands a multi-day time-off entry into one item per covered day", () => {
    const items = timeOffInRange(
      [{ id: "timeoff-3", person_id: "person-1", start_date: "2026-08-30", end_date: "2026-09-02", reason: "Vacation" }],
      [RICHARD],
      new Date(2026, 7, 28),
      new Date(2026, 8, 5)
    );
    expect(items).toHaveLength(4);
    expect(items.map((i) => i.date.getDate())).toEqual([30, 31, 1, 2]);
  });

  it("returns nothing when the entry doesn't overlap the range", () => {
    const items = timeOffInRange(
      [{ id: "timeoff-4", person_id: "person-1", start_date: "2026-01-01", end_date: "2026-01-02", reason: "" }],
      [RICHARD],
      new Date(2026, 7, 1),
      new Date(2026, 7, 31)
    );
    expect(items).toHaveLength(0);
  });
});

describe("timeOffTitle", () => {
  it("includes the reason when present", () => {
    const [item] = timeOffInRange(
      [{ id: "timeoff-5", person_id: "person-1", start_date: "2026-08-26", end_date: "2026-08-26", reason: "Vacation" }],
      [RICHARD],
      new Date(2026, 7, 26),
      new Date(2026, 7, 26)
    );
    expect(timeOffTitle(item)).toBe("Richard Smith off work \u2014 Vacation");
  });

  it("falls back to a generic label when no reason was given", () => {
    const [item] = timeOffInRange(
      [{ id: "timeoff-6", person_id: "person-1", start_date: "2026-08-26", end_date: "2026-08-26", reason: "" }],
      [RICHARD],
      new Date(2026, 7, 26),
      new Date(2026, 7, 26)
    );
    expect(timeOffTitle(item)).toBe("Richard Smith off work");
  });
});
