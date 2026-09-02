// Module 8 (brief_registration_v2, D-1XX). "The brief composes; modules
// don't format." This is the one place that ranks and caps -- every
// contributor just returns BriefItem[], unsorted, uncapped.
//
// Hard rule from the brief: "the brief must never get slower or noisier as
// modules are added... If a module would push the brief past its cap, the
// brief drops the lowest-priority items rather than growing." Caps are
// per-category (not a single global cap) since categories render as
// separate cards/sections and a busy Household day shouldn't crowd out
// Opportunities or vice versa.
import type { BriefCategory, BriefItem } from "./types";

/** Conservative defaults chosen to match what each category already showed
 * before Module 8 existed (e.g. Opportunities already sliced to 2 on the
 * Brief card, D-070) so turning the flag on doesn't visibly change output
 * for categories that had no new items to add. */
export const DEFAULT_CATEGORY_CAPS: Record<BriefCategory, number> = {
  ai: 12,
  opportunities: 2,
  household: 3,
};

/**
 * Groups by category, sorts each group by priority descending, and keeps
 * only the top `caps[category]` (or the default) items -- overflow items
 * are dropped, lowest-priority first, never truncated arbitrarily by
 * insertion order. Ties keep contributor order (stable sort).
 */
export function composeBrief(
  items: BriefItem[],
  caps: Partial<Record<BriefCategory, number>> = {}
): BriefItem[] {
  const byCategory = new Map<BriefCategory, BriefItem[]>();
  for (const item of items) {
    const list = byCategory.get(item.category);
    if (list) list.push(item);
    else byCategory.set(item.category, [item]);
  }

  const result: BriefItem[] = [];
  for (const [category, list] of byCategory) {
    const cap = caps[category] ?? DEFAULT_CATEGORY_CAPS[category] ?? 3;
    const sorted = [...list].sort((a, b) => b.priority - a.priority);
    result.push(...sorted.slice(0, Math.max(0, cap)));
  }
  return result;
}

/** Items in one category, already capped/sorted -- what a section renderer maps over. */
export function itemsForCategory(items: BriefItem[], category: BriefCategory): BriefItem[] {
  return items.filter((item) => item.category === category);
}
