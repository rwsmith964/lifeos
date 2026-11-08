import { describe, expect, it } from "vitest";
import { anchorMondayOf, buildPattern, describePattern, formatClock } from "./pattern";

const WORK_WEEK = [true, true, true, true, true, false, false];
const NOTHING = [false, false, false, false, false, false, false];

describe("anchorMondayOf", () => {
  it("snaps any day to the Monday of its week", () => {
    expect(anchorMondayOf("2026-11-08")).toBe("2026-11-02"); // Sunday -> prior Monday
    expect(anchorMondayOf("2026-11-04")).toBe("2026-11-02"); // Wednesday
    expect(anchorMondayOf("2026-11-02")).toBe("2026-11-02"); // already Monday
  });
});

describe("buildPattern", () => {
  it("indexes weekday 0 as Monday and week 2 starting at day 7", () => {
    const pattern = buildPattern([WORK_WEEK, NOTHING], { startTime: null, endTime: null });
    expect(pattern.map((p) => p.dayIndex)).toEqual([0, 1, 2, 3, 4]);
  });

  it("puts an active second week at 7-13", () => {
    const pattern = buildPattern([NOTHING, [false, false, false, false, false, true, true]], { startTime: "09:00", endTime: "17:00" });
    expect(pattern).toEqual([
      { dayIndex: 12, startTime: "09:00", endTime: "17:00" },
      { dayIndex: 13, startTime: "09:00", endTime: "17:00" },
    ]);
  });
});

describe("describePattern", () => {
  it("summarizes a weekly school pattern with times", () => {
    const pattern = buildPattern([WORK_WEEK], { startTime: "08:00", endTime: "15:00" });
    expect(describePattern(7, pattern)).toBe("Every week: Mon-Fri, 8:00 AM-3:00 PM");
  });

  it("summarizes alternating weeks", () => {
    const pattern = buildPattern([WORK_WEEK, NOTHING], { startTime: null, endTime: null });
    expect(describePattern(14, pattern)).toBe("Alternating weeks — week 1: Mon-Fri, week 2: off");
  });

  it("lists scattered days individually", () => {
    const pattern = buildPattern([[true, false, true, false, false, false, false]], { startTime: null, endTime: null });
    expect(describePattern(7, pattern)).toBe("Every week: Mon, Wed");
  });
});

describe("formatClock", () => {
  it("formats 24-hour times", () => {
    expect(formatClock("00:00")).toBe("12:00 AM");
    expect(formatClock("12:30")).toBe("12:30 PM");
    expect(formatClock("15:00")).toBe("3:00 PM");
  });
});
