// Deterministic per-child color assignment for custody rendering (round-2
// brief 2.2: "colour-coded per child"). Stable across renders/requests
// because it's keyed by sorted person id, not insertion order.
const PALETTE = [
  { dot: "bg-sky-500", badge: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" },
  { dot: "bg-rose-500", badge: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300" },
  { dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  { dot: "bg-violet-500", badge: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300" },
  { dot: "bg-amber-500", badge: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
];

export function buildChildColorMap(childPersonIds: string[]): Map<string, { dot: string; badge: string }> {
  const sorted = [...new Set(childPersonIds)].sort();
  const map = new Map<string, { dot: string; badge: string }>();
  sorted.forEach((id, i) => map.set(id, PALETTE[i % PALETTE.length]));
  return map;
}
