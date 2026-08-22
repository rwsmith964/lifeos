import { describe, expect, it } from "vitest";
import { evaluateCadence, findOverdueCadences } from "./cadence";

describe("evaluateCadence", () => {
  it("is overdue with null daysSinceLastContact when there's never been contact", () => {
    const result = evaluateCadence({ target_interval_days: 14, last_contact_date: null }, new Date(2026, 7, 1));
    expect(result).toEqual({ isOverdue: true, daysSinceLastContact: null });
  });

  it("is not overdue when last contact is within the target interval", () => {
    const result = evaluateCadence(
      { target_interval_days: 14, last_contact_date: "2026-07-25" },
      new Date(2026, 7, 1) // Aug 1 - 7 days since July 25
    );
    expect(result.isOverdue).toBe(false);
    expect(result.daysSinceLastContact).toBe(7);
  });

  it("is overdue exactly on the boundary (days since == target interval)", () => {
    const result = evaluateCadence(
      { target_interval_days: 14, last_contact_date: "2026-07-18" },
      new Date(2026, 7, 1) // exactly 14 days
    );
    expect(result.isOverdue).toBe(true);
    expect(result.daysSinceLastContact).toBe(14);
  });

  it("matches the spec's own example: golf buddy overdue since April", () => {
    const result = evaluateCadence(
      { target_interval_days: 30, last_contact_date: "2026-04-15" },
      new Date(2026, 7, 1) // Aug 1
    );
    expect(result.isOverdue).toBe(true);
    expect(result.daysSinceLastContact).toBeGreaterThan(100);
  });
});

describe("findOverdueCadences", () => {
  const today = new Date(2026, 7, 1);

  it("filters out non-overdue cadences", () => {
    const cadences = [
      { id: "mike", target_interval_days: 14, last_contact_date: "2026-06-01" }, // overdue
      { id: "dave", target_interval_days: 30, last_contact_date: "2026-07-25" }, // not overdue
    ];
    const result = findOverdueCadences(cadences, today);
    expect(result.map((c) => c.id)).toEqual(["mike"]);
  });

  it("sorts most-overdue first", () => {
    const cadences = [
      { id: "recent", target_interval_days: 7, last_contact_date: "2026-07-01" }, // 31 days overdue by 24
      { id: "ancient", target_interval_days: 7, last_contact_date: "2026-01-01" }, // way overdue
    ];
    const result = findOverdueCadences(cadences, today);
    expect(result.map((c) => c.id)).toEqual(["ancient", "recent"]);
  });

  it("puts never-contacted (null days) at the front", () => {
    const cadences = [
      { id: "known", target_interval_days: 7, last_contact_date: "2026-01-01" },
      { id: "never", target_interval_days: 7, last_contact_date: null },
    ];
    const result = findOverdueCadences(cadences, today);
    expect(result[0].id).toBe("never");
  });
});
