import { describe, expect, it } from "vitest";
import { findOverdueCompanions } from "./companions";

const TODAY = new Date(2026, 7, 1);

describe("findOverdueCompanions", () => {
  it("surfaces a companion who is overdue for contact (the spec's own golf/Mike example)", () => {
    const cadences = new Map([["mike", { target_interval_days: 14, last_contact_date: "2026-06-01" }]]);
    const result = findOverdueCompanions(["mike"], cadences, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].personId).toBe("mike");
  });

  it("does not surface a companion who is within their contact cadence", () => {
    const cadences = new Map([["dave", { target_interval_days: 30, last_contact_date: "2026-07-25" }]]);
    const result = findOverdueCompanions(["dave"], cadences, TODAY);
    expect(result).toEqual([]);
  });

  it("skips a companion with no tracked cadence rather than assuming overdue", () => {
    const result = findOverdueCompanions(["untracked-person"], new Map(), TODAY);
    expect(result).toEqual([]);
  });

  it("handles multiple preferred companions, only surfacing the overdue ones", () => {
    const cadences = new Map([
      ["mike", { target_interval_days: 14, last_contact_date: "2026-06-01" }], // overdue
      ["dave", { target_interval_days: 30, last_contact_date: "2026-07-25" }], // not overdue
    ]);
    const result = findOverdueCompanions(["mike", "dave"], cadences, TODAY);
    expect(result.map((r) => r.personId)).toEqual(["mike"]);
  });
});
