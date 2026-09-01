import { describe, expect, it } from "vitest";
import { resolveGearChecklist } from "./gear-checklist";
import type { GearChecklistItemRow } from "../db/database.types";

function makeItem(overrides: Partial<GearChecklistItemRow>): GearChecklistItemRow {
  return {
    id: "item-id",
    household_id: "household-id",
    user_activity_id: null,
    activity_type_key: null,
    item_label: "Item",
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("resolveGearChecklist", () => {
  it("returns an empty list when there are no items of either kind", () => {
    expect(resolveGearChecklist([], [])).toEqual([]);
  });

  it("lists activity-specific items before type defaults", () => {
    const activityItems = [makeItem({ id: "a1", user_activity_id: "act-1", item_label: "Rod", sort_order: 0 })];
    const typeItems = [makeItem({ id: "t1", activity_type_key: "fishing", item_label: "Waders", sort_order: 0 })];

    const result = resolveGearChecklist(activityItems, typeItems);
    expect(result.map((r) => r.label)).toEqual(["Rod", "Waders"]);
    expect(result[0].origin).toBe("activity");
    expect(result[1].origin).toBe("type_default");
  });

  it("respects sort_order within each group", () => {
    const activityItems = [
      makeItem({ id: "a2", user_activity_id: "act-1", item_label: "Second", sort_order: 2 }),
      makeItem({ id: "a1", user_activity_id: "act-1", item_label: "First", sort_order: 1 }),
    ];
    const result = resolveGearChecklist(activityItems, []);
    expect(result.map((r) => r.label)).toEqual(["First", "Second"]);
  });

  it("skips a type default whose label (trimmed, case-insensitive) already exists as an activity-specific item", () => {
    const activityItems = [makeItem({ id: "a1", user_activity_id: "act-1", item_label: "  Sunscreen  ", sort_order: 0 })];
    const typeItems = [makeItem({ id: "t1", activity_type_key: "golf", item_label: "sunscreen", sort_order: 0 })];

    const result = resolveGearChecklist(activityItems, typeItems);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("  Sunscreen  "); // activity-specific wording wins verbatim
  });

  it("does not mutate the input arrays", () => {
    const activityItems = [makeItem({ id: "a2", item_label: "B", sort_order: 2 }), makeItem({ id: "a1", item_label: "A", sort_order: 1 })];
    const originalOrder = activityItems.map((i) => i.id);
    resolveGearChecklist(activityItems, []);
    expect(activityItems.map((i) => i.id)).toEqual(originalOrder);
  });
});
