import { describe, expect, it } from "vitest";
import { describeMonthlyRule, expandMonthlyRules, nthWeekdayOfMonth } from "./monthly-rules";

const MEL = "mel";
const SATURDAY = 6;

describe("nthWeekdayOfMonth", () => {
  it("finds the first Saturday (November 2026 starts on a Sunday, so it's Nov 7)", () => {
    expect(nthWeekdayOfMonth(2026, 10, SATURDAY, 1)?.getDate()).toBe(7);
  });

  it("finds the first Saturday when the month itself starts on a Saturday", () => {
    expect(nthWeekdayOfMonth(2026, 7, SATURDAY, 1)?.getDate()).toBe(1);
  });

  it("finds the last Saturday", () => {
    expect(nthWeekdayOfMonth(2026, 10, SATURDAY, -1)?.getDate()).toBe(28);
  });

  it("finds the fourth Saturday of a four-Saturday month", () => {
    expect(nthWeekdayOfMonth(2026, 1, SATURDAY, 4)?.getDate()).toBe(28);
  });
});

describe("expandMonthlyRules", () => {
  const firstSaturday = [{ ordinal: 1, day_of_week: SATURDAY, responsible_person_id: MEL }];

  it("lands on the first Saturday of each month in the window", () => {
    const dates = [...expandMonthlyRules(firstSaturday, new Date(2026, 10, 1), new Date(2027, 0, 31)).keys()];
    expect(dates).toEqual(["2026-11-07", "2026-12-05", "2027-01-02"]);
  });

  it("excludes dates outside the window", () => {
    const dates = [...expandMonthlyRules(firstSaturday, new Date(2026, 10, 8), new Date(2026, 11, 4)).keys()];
    expect(dates).toEqual([]);
  });

  it("includes both ends of the window", () => {
    const dates = [...expandMonthlyRules(firstSaturday, new Date(2026, 10, 7), new Date(2026, 10, 7)).keys()];
    expect(dates).toEqual(["2026-11-07"]);
  });

  it("maps each date to the rule's parent", () => {
    const result = expandMonthlyRules(firstSaturday, new Date(2026, 10, 1), new Date(2026, 10, 30));
    expect(result.get("2026-11-07")).toBe(MEL);
  });

  it("lets a later rule win when two land on the same day", () => {
    const rules = [
      { ordinal: 4, day_of_week: SATURDAY, responsible_person_id: "a" },
      { ordinal: -1, day_of_week: SATURDAY, responsible_person_id: "b" },
    ];
    expect(expandMonthlyRules(rules, new Date(2026, 1, 1), new Date(2026, 1, 28)).get("2026-02-28")).toBe("b");
  });
});

describe("describeMonthlyRule", () => {
  it("reads naturally", () => {
    expect(describeMonthlyRule({ ordinal: 1, day_of_week: 6 })).toBe("first Saturday of every month");
    expect(describeMonthlyRule({ ordinal: -1, day_of_week: 0 })).toBe("last Sunday of every month");
  });
});
