import * as React from "react";
import { cn } from "@/lib/utils";

// Redesign (Part 3 — Component anatomy: Table row, built for People's
// table). "Grid 210px 124px 112px 1fr 76px, 16px gap, 14px 16px padding,
// radius 12, transparent 1px border that becomes visible on hover." Named
// slots match the People columns (Person/Rhythm/Last contact/Next thing/
// action) exactly -- see docs/redesign-brief.md Part 2.
export function TableRow({
  person,
  rhythm,
  lastContact,
  nextThing,
  action,
  slipping = false,
  className,
}: {
  person: React.ReactNode;
  rhythm: React.ReactNode;
  lastContact: React.ReactNode;
  nextThing: React.ReactNode;
  action: React.ReactNode;
  /** Rows past cadence get a slipping-tinted border (Part 2). */
  slipping?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[210px_124px_112px_1fr_76px] items-center gap-4 rounded-table-row border px-4 py-[14px] motion-safe-transition hover:border-line-strong",
        slipping ? "border-slipping/40" : "border-transparent",
        className
      )}
    >
      <div className="min-w-0">{person}</div>
      <div className="min-w-0">{rhythm}</div>
      <div className="min-w-0 font-sans text-body text-ink-2">{lastContact}</div>
      <div className="min-w-0 font-sans text-body text-ink-2">{nextThing}</div>
      <div className="flex justify-end">{action}</div>
    </div>
  );
}

// Rhythm cell: "12.5/700 label, 5px gap, 4px-tall track with a 3px radius
// fill." Three tiers, not the binary settled-or-slipping Part 2's text
// describes -- see lib/people/rhythm.ts's own doc comment for why.
const TIER_FILL: Record<"settled" | "warning" | "slipping", string> = {
  settled: "bg-settled",
  warning: "bg-action",
  slipping: "bg-slipping",
};
const TIER_LABEL_COLOR: Record<"settled" | "warning" | "slipping", string> = {
  settled: "text-ink",
  warning: "text-action",
  slipping: "text-slipping",
};

export function RhythmCell({
  label,
  healthPct,
  tier,
}: {
  label: string;
  healthPct: number;
  tier: "settled" | "warning" | "slipping";
}) {
  // The bar visually reads as "how much rhythm is left," so it fills from
  // full at 0 days elapsed down toward empty as the cadence lapses --
  // healthPct already carries that inverted sense (see evaluateRhythm).
  return (
    <div className="flex flex-col gap-[5px]">
      <span className={cn("font-sans text-rhythm-label", TIER_LABEL_COLOR[tier])}>{label}</span>
      <div className="h-1 w-full overflow-hidden rounded-[3px] bg-surface-2">
        <div className={cn("h-full rounded-[3px]", TIER_FILL[tier])} style={{ width: `${Math.max(6, healthPct)}%` }} />
      </div>
    </div>
  );
}
