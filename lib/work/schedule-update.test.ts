import { describe, expect, it } from "vitest";
import { parseWorkDays, planWorkScheduleUpdate, type ExistingShift } from "./schedule-update";

const shift = (id: string, day: number, start = "07:00:00", end = "16:00:00"): ExistingShift => ({
  id,
  day_of_week: day,
  start_time: start,
  end_time: end,
});

const weekdays = [1, 2, 3, 4, 5].map((d) => shift(`s${d}`, d));

describe("planWorkScheduleUpdate", () => {
  it("changes 7-4 to 7-5 on every day already worked", () => {
    const plan = planWorkScheduleUpdate(weekdays, { startTime: "07:00", endTime: "17:00", days: null });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.changes).toHaveLength(5);
    expect(plan.changes.every((c) => c.kind === "update")).toBe(true);
    expect(plan.changes[0]).toEqual({ kind: "update", id: "s1", startTime: "07:00", endTime: "17:00" });
  });

  it("only touches the named days and adds a shift for a day with none", () => {
    const plan = planWorkScheduleUpdate(weekdays, { startTime: "07:00", endTime: "17:00", days: "1,6" });
    expect(plan.ok && plan.changes).toEqual([
      { kind: "update", id: "s1", startTime: "07:00", endTime: "17:00" },
      { kind: "create", dayOfWeek: 6, startTime: "07:00", endTime: "17:00" },
    ]);
  });

  it("skips days that already have those hours", () => {
    const rows = [shift("a", 1, "07:00:00", "17:00:00"), shift("b", 2)];
    const plan = planWorkScheduleUpdate(rows, { startTime: "07:00", endTime: "17:00", days: null });
    expect(plan.ok && plan.changes).toEqual([{ kind: "update", id: "b", startTime: "07:00", endTime: "17:00" }]);
  });

  it("collapses a split shift to the one new shift", () => {
    const rows = [shift("am", 1, "07:00:00", "11:00:00"), shift("pm", 1, "12:00:00", "16:00:00")];
    const plan = planWorkScheduleUpdate(rows, { startTime: "07:00", endTime: "17:00", days: null });
    expect(plan.ok && plan.changes).toEqual([
      { kind: "update", id: "am", startTime: "07:00", endTime: "17:00" },
      { kind: "delete", id: "pm" },
    ]);
  });

  it("explains what's missing rather than guessing", () => {
    expect(planWorkScheduleUpdate(weekdays, { startTime: "07:00", endTime: null, days: null })).toMatchObject({ ok: false });
    expect(planWorkScheduleUpdate(weekdays, { startTime: "17:00", endTime: "07:00", days: null })).toMatchObject({ ok: false });
    expect(planWorkScheduleUpdate([], { startTime: "07:00", endTime: "17:00", days: null })).toMatchObject({ ok: false });
    expect(planWorkScheduleUpdate([shift("a", 1, "07:00:00", "17:00:00")], { startTime: "07:00", endTime: "17:00", days: null })).toMatchObject({ ok: false });
  });
});

describe("parseWorkDays", () => {
  it("parses a comma list, dropping junk and duplicates", () => {
    expect(parseWorkDays("1, 2,2,9,x")).toEqual([1, 2]);
    expect(parseWorkDays("")).toBeNull();
    expect(parseWorkDays(null)).toBeNull();
  });
});
