// Module 2 (leisure_planner_v2, D-118): merges a type-level default gear
// checklist with an activity-specific checklist into one ordered list to
// show before an outing. Pure, DB-free -- the repository layer
// (lib/db/repositories/leisure-planner.ts) fetches both lists separately;
// this is the only place that decides how they combine.
import type { GearChecklistItemRow } from "../db/database.types";

export interface ResolvedGearChecklistItem {
  id: string;
  label: string;
  /** Where this item came from -- lets a UI badge type-level defaults
   * differently from items someone added just for this activity. */
  origin: "activity" | "type_default";
}

/**
 * Combines type-level defaults and activity-specific items into one
 * checklist, activity-specific items first (most relevant to *this*
 * outing), then type defaults, each group in its own sort_order. A type
 * default is skipped if an activity-specific item with the exact same
 * (trimmed, case-insensitive) label already covers it, so editing "bring
 * sunscreen" onto one activity doesn't show a duplicate "Sunscreen" row
 * from the type default.
 */
export function resolveGearChecklist(
  activityItems: GearChecklistItemRow[],
  typeDefaultItems: GearChecklistItemRow[]
): ResolvedGearChecklistItem[] {
  const sortedActivityItems = [...activityItems].sort((a, b) => a.sort_order - b.sort_order);
  const sortedTypeItems = [...typeDefaultItems].sort((a, b) => a.sort_order - b.sort_order);

  const activityLabelsSeen = new Set(sortedActivityItems.map((item) => normalizeLabel(item.item_label)));

  const resolved: ResolvedGearChecklistItem[] = sortedActivityItems.map((item) => ({
    id: item.id,
    label: item.item_label,
    origin: "activity",
  }));

  for (const item of sortedTypeItems) {
    if (activityLabelsSeen.has(normalizeLabel(item.item_label))) continue;
    resolved.push({ id: item.id, label: item.item_label, origin: "type_default" });
  }

  return resolved;
}

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}
