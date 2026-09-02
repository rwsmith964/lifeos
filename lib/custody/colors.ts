// Deterministic per-child color assignment for custody rendering (round-2
// brief 2.2: "colour-coded per child"). Stable across renders/requests
// because it's keyed by sorted person id, not insertion order.
const CHILD_PALETTE = [
  { dot: "bg-sky-500", badge: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" },
  { dot: "bg-rose-500", badge: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300" },
  { dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  { dot: "bg-violet-500", badge: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300" },
  { dot: "bg-amber-500", badge: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
];

// D-132: separate palette for the *responsible parent* (who has the kids),
// deliberately using different hues than CHILD_PALETTE above so the two
// color-coding schemes never look like the same signal when both appear on
// the same day cell (a child-colored dot in the list below vs. a
// parent-colored frame around the cell itself, see buildMonthCellCustodyBars
// in lib/calendar/month-cell.ts).
const PARENT_PALETTE = [
  { bar: "bg-blue-500", border: "border-blue-500" },
  { bar: "bg-pink-500", border: "border-pink-500" },
  { bar: "bg-teal-500", border: "border-teal-500" },
  { bar: "bg-orange-500", border: "border-orange-500" },
];

function buildColorMapFromPalette<T extends object>(personIds: string[], palette: T[]): Map<string, T> {
  const sorted = [...new Set(personIds)].sort();
  const map = new Map<string, T>();
  sorted.forEach((id, i) => map.set(id, palette[i % palette.length]));
  return map;
}

export function buildChildColorMap(childPersonIds: string[]): Map<string, { dot: string; badge: string }> {
  return buildColorMapFromPalette(childPersonIds, CHILD_PALETTE);
}

/** Same deterministic-by-sorted-id scheme as buildChildColorMap, but for
 * whichever parent/co-parent is responsible for a custody block -- used to
 * color the month-view custody "frame" (D-132) rather than the per-child
 * dot list. */
export function buildParentColorMap(parentPersonIds: string[]): Map<string, { bar: string; border: string }> {
  return buildColorMapFromPalette(parentPersonIds, PARENT_PALETTE);
}
