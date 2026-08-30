import { describe, expect, it } from "vitest";
import {
  buildPresetCycle,
  cycleAssignmentForDate,
  cycleDayIndexForDate,
  findGaps,
  handoverTimeForDayIndex,
  projectCustodySchedule,
  type CustodyScheduleDefinition,
} from "./schedule";

const PARENT_A = "parent-a";
const PARENT_B = "parent-b";

describe("cycleAssignmentForDate", () => {
  const weekOnWeekOff: CustodyScheduleDefinition = {
    cycleLengthDays: 14,
    cycleAssignments: buildPresetCycle("week_on_week_off", PARENT_A, PARENT_B).cycleAssignments,
    anchorDate: "2026-09-01", // Tuesday — deliberately not a Monday, to prove the engine isn't calendar-week-aware
    startDate: "2026-01-01",
    endDate: null,
  };

  it("assigns the anchor date itself to day index 0", () => {
    expect(cycleAssignmentForDate(weekOnWeekOff, "2026-09-01")).toBe(PARENT_A);
  });

  it("assigns the second week of the cycle to the other parent", () => {
    expect(cycleAssignmentForDate(weekOnWeekOff, "2026-09-08")).toBe(PARENT_B);
  });

  it("wraps correctly into a third cycle", () => {
    expect(cycleAssignmentForDate(weekOnWeekOff, "2026-09-15")).toBe(PARENT_A); // day 14 -> index 0 again
  });

  it("handles dates before the anchor via positive modulo, not a negative index", () => {
    // One day before the anchor is the last day of the *previous* cycle
    // (index 13, secondary parent), not an out-of-range/negative result.
    expect(cycleAssignmentForDate(weekOnWeekOff, "2026-08-31")).toBe(PARENT_B);
  });

  it("returns null for a day index with no assignment in a partial custom cycle", () => {
    const partial: CustodyScheduleDefinition = {
      cycleLengthDays: 7,
      cycleAssignments: [{ dayIndex: 0, responsiblePersonId: PARENT_A }],
      anchorDate: "2026-09-01",
      startDate: "2026-01-01",
      endDate: null,
    };
    expect(cycleAssignmentForDate(partial, "2026-09-02")).toBeNull();
  });
});

describe("buildPresetCycle", () => {
  it("week_on_week_off: first week all primary, second week all secondary", () => {
    const { cycleAssignments } = buildPresetCycle("week_on_week_off", PARENT_A, PARENT_B);
    const byIndex = new Map(cycleAssignments.map((a) => [a.dayIndex, a.responsiblePersonId]));
    for (let i = 0; i <= 6; i++) expect(byIndex.get(i)).toBe(PARENT_A);
    for (let i = 7; i <= 13; i++) expect(byIndex.get(i)).toBe(PARENT_B);
  });

  it("two_two_three: every day of the 14-day cycle is covered by exactly one assignment", () => {
    const { cycleAssignments, cycleLengthDays } = buildPresetCycle("two_two_three", PARENT_A, PARENT_B);
    const indices = cycleAssignments.map((a) => a.dayIndex).sort((a, b) => a - b);
    expect(indices).toEqual(Array.from({ length: cycleLengthDays }, (_, i) => i));
  });

  it("two_two_five_five: covers all 14 days with the documented 2/2/5/5 split", () => {
    const { cycleAssignments } = buildPresetCycle("two_two_five_five", PARENT_A, PARENT_B);
    const byIndex = new Map(cycleAssignments.map((a) => [a.dayIndex, a.responsiblePersonId]));
    expect([0, 1].every((i) => byIndex.get(i) === PARENT_A)).toBe(true);
    expect([2, 3].every((i) => byIndex.get(i) === PARENT_B)).toBe(true);
    expect([4, 5, 6, 7, 8].every((i) => byIndex.get(i) === PARENT_A)).toBe(true);
    expect([9, 10, 11, 12, 13].every((i) => byIndex.get(i) === PARENT_B)).toBe(true);
  });

  it("alternating_weekends: weekdays always primary, weekends alternate", () => {
    const { cycleAssignments } = buildPresetCycle("alternating_weekends", PARENT_A, PARENT_B);
    const byIndex = new Map(cycleAssignments.map((a) => [a.dayIndex, a.responsiblePersonId]));
    expect([0, 1, 2, 3, 4, 7, 8, 9, 10, 11].every((i) => byIndex.get(i) === PARENT_A)).toBe(true);
    expect([5, 6].every((i) => byIndex.get(i) === PARENT_A)).toBe(true);
    expect([12, 13].every((i) => byIndex.get(i) === PARENT_B)).toBe(true);
  });
});

describe("projectCustodySchedule", () => {
  const schedule: CustodyScheduleDefinition = {
    cycleLengthDays: 14,
    cycleAssignments: buildPresetCycle("week_on_week_off", PARENT_A, PARENT_B).cycleAssignments,
    anchorDate: "2026-09-01",
    startDate: "2026-09-01",
    endDate: null,
  };

  it("projects one entry per day across the requested window", () => {
    const days = projectCustodySchedule(schedule, new Map(), new Date(2026, 8, 1), new Date(2026, 8, 14));
    expect(days).toHaveLength(14);
    expect(days[0]).toEqual({ date: "2026-09-01", responsiblePersonId: PARENT_A, isException: false });
    expect(days[7]).toEqual({ date: "2026-09-08", responsiblePersonId: PARENT_B, isException: false });
  });

  it("clips to the schedule's own start_date even when the window starts earlier", () => {
    const days = projectCustodySchedule(schedule, new Map(), new Date(2026, 7, 25), new Date(2026, 8, 2));
    expect(days.every((d) => d.date >= "2026-09-01")).toBe(true);
  });

  it("clips to the schedule's end_date when set", () => {
    const bounded: CustodyScheduleDefinition = { ...schedule, endDate: "2026-09-05" };
    const days = projectCustodySchedule(bounded, new Map(), new Date(2026, 8, 1), new Date(2026, 8, 14));
    expect(days.every((d) => d.date <= "2026-09-05")).toBe(true);
    expect(days).toHaveLength(5);
  });

  it("an exception overrides the cycle's default assignment for that date (round-2 regression: holiday rotations)", () => {
    const exceptions = new Map([["2026-09-03", PARENT_B]]); // would otherwise be PARENT_A
    const days = projectCustodySchedule(schedule, exceptions, new Date(2026, 8, 1), new Date(2026, 8, 5));
    const overridden = days.find((d) => d.date === "2026-09-03");
    expect(overridden).toEqual({ date: "2026-09-03", responsiblePersonId: PARENT_B, isException: true });
  });

  it("omits days a partial custom cycle leaves unassigned, rather than inventing a parent", () => {
    const partial: CustodyScheduleDefinition = {
      cycleLengthDays: 3,
      cycleAssignments: [{ dayIndex: 0, responsiblePersonId: PARENT_A }],
      anchorDate: "2026-09-01",
      startDate: "2026-09-01",
      endDate: null,
    };
    const days = projectCustodySchedule(partial, new Map(), new Date(2026, 8, 1), new Date(2026, 8, 3));
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe("2026-09-01");
  });
});

describe("findGaps", () => {
  it("reports no gaps when every day in the window is covered", () => {
    const days = [
      { date: "2026-09-01", responsiblePersonId: PARENT_A, isException: false },
      { date: "2026-09-02", responsiblePersonId: PARENT_A, isException: false },
    ];
    expect(findGaps(days, new Date(2026, 8, 1), new Date(2026, 8, 2))).toEqual([]);
  });

  it("reports a single-day gap", () => {
    const days = [
      { date: "2026-09-01", responsiblePersonId: PARENT_A, isException: false },
      { date: "2026-09-03", responsiblePersonId: PARENT_A, isException: false },
    ];
    expect(findGaps(days, new Date(2026, 8, 1), new Date(2026, 8, 3))).toEqual([
      { startDate: "2026-09-02", endDate: "2026-09-02" },
    ]);
  });

  it("reports a multi-day gap as one range, and a trailing gap to the window end", () => {
    const days = [{ date: "2026-09-01", responsiblePersonId: PARENT_A, isException: false }];
    expect(findGaps(days, new Date(2026, 8, 1), new Date(2026, 8, 4))).toEqual([
      { startDate: "2026-09-02", endDate: "2026-09-04" },
    ]);
  });
});

describe("cycleDayIndexForDate", () => {
  const schedule = { anchorDate: "2026-08-28", cycleLengthDays: 7 }; // anchor is a Friday

  it("maps the anchor date to dayIndex 0", () => {
    expect(cycleDayIndexForDate(schedule, "2026-08-28")).toBe(0);
  });

  it("maps subsequent days to increasing indices, wrapping at cycleLengthDays", () => {
    expect(cycleDayIndexForDate(schedule, "2026-08-31")).toBe(3); // Monday, 3 days after the Friday anchor
    expect(cycleDayIndexForDate(schedule, "2026-09-04")).toBe(0); // wraps to a new cycle (day 7 -> index 0)
  });

  it("handles dates before the anchor via positive modulo", () => {
    expect(cycleDayIndexForDate(schedule, "2026-08-27")).toBe(6); // one day before anchor -> last index of the previous cycle
  });
});

describe("handoverTimeForDayIndex — D-074 per-day handover time overrides", () => {
  it("falls back to the schedule's single handover_time when there is no override map", () => {
    const schedule = { handover_time: "17:00:00", custom_handover_times: null };
    expect(handoverTimeForDayIndex(schedule, 0)).toBe("17:00:00");
    expect(handoverTimeForDayIndex(schedule, 5)).toBe("17:00:00");
  });

  it("falls back to handover_time for a dayIndex with no explicit override", () => {
    const schedule = { handover_time: "17:00:00", custom_handover_times: { "5": "16:30" } };
    expect(handoverTimeForDayIndex(schedule, 0)).toBe("17:00:00");
  });

  it("uses the per-day override when one is set for that dayIndex", () => {
    // The user's real reported pattern: Friday 4:30pm pickup, Monday 8:30am return.
    const schedule = {
      handover_time: "17:00:00",
      custom_handover_times: { "5": "16:30", "1": "08:30" }, // Fri=5, Mon=1 in a Sunday-anchored 7-day cycle
    };
    expect(handoverTimeForDayIndex(schedule, 5)).toBe("16:30");
    expect(handoverTimeForDayIndex(schedule, 1)).toBe("08:30");
    expect(handoverTimeForDayIndex(schedule, 2)).toBe("17:00:00"); // untouched day still falls back
  });
});
