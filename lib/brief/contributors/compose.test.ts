// Module 8 (brief_registration_v2, D-1XX): pure-function tests for the
// rank-and-cap step every contributor's output goes through.
import { describe, expect, it } from "vitest";
import { composeBrief, DEFAULT_CATEGORY_CAPS, itemsForCategory } from "./compose";
import type { BriefItem } from "./types";

function item(overrides: Partial<BriefItem> = {}): BriefItem {
  return {
    id: "item-1",
    category: "household",
    priority: 50,
    leadTimeDays: 0,
    title: "Test item",
    ...overrides,
  };
}

describe("composeBrief", () => {
  it("sorts a category's items by priority descending", () => {
    const items = [
      item({ id: "low", priority: 10 }),
      item({ id: "high", priority: 90 }),
      item({ id: "mid", priority: 50 }),
    ];
    const result = composeBrief(items);
    expect(result.map((i) => i.id)).toEqual(["high", "mid", "low"]);
  });

  it("drops the lowest-priority items in a category once it exceeds the cap, instead of growing", () => {
    const items = Array.from({ length: DEFAULT_CATEGORY_CAPS.household + 5 }, (_, i) =>
      item({ id: `item-${i}`, priority: i }) // ascending priority, so item-0 is lowest
    );
    const result = composeBrief(items);
    expect(result).toHaveLength(DEFAULT_CATEGORY_CAPS.household);
    // Kept items are exactly the highest-priority ones -- the lowest-priority
    // ones (item-0, item-1, ...) are the ones dropped.
    const keptIds = result.map((i) => i.id);
    expect(keptIds).not.toContain("item-0");
    expect(keptIds).toContain(`item-${items.length - 1}`);
  });

  it("caps each category independently -- a busy household category doesn't crowd out opportunities", () => {
    const items = [
      ...Array.from({ length: 10 }, (_, i) => item({ id: `household-${i}`, category: "household", priority: i })),
      ...Array.from({ length: 10 }, (_, i) => item({ id: `opp-${i}`, category: "opportunities", priority: i })),
    ];
    const result = composeBrief(items);
    expect(itemsForCategory(result, "household")).toHaveLength(DEFAULT_CATEGORY_CAPS.household);
    expect(itemsForCategory(result, "opportunities")).toHaveLength(DEFAULT_CATEGORY_CAPS.opportunities);
  });

  it("respects an explicit per-call cap override", () => {
    const items = Array.from({ length: 5 }, (_, i) => item({ id: `item-${i}`, priority: i }));
    const result = composeBrief(items, { household: 1 });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("item-4"); // highest priority
  });

  it("returns an empty array for empty input", () => {
    expect(composeBrief([])).toEqual([]);
  });
});

describe("itemsForCategory", () => {
  it("filters to just the requested category, preserving order", () => {
    const items = [
      item({ id: "a", category: "household" }),
      item({ id: "b", category: "opportunities" }),
      item({ id: "c", category: "household" }),
    ];
    expect(itemsForCategory(items, "household").map((i) => i.id)).toEqual(["a", "c"]);
  });
});
