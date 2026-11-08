import * as React from "react";
import { cn } from "@/lib/utils";

// F2 (audit pass 2026-09-11): "People rows are a five-column grid (210px
// 124px 112px 1fr 76px) with no header row, so columns are unnamed; for
// three of five people the middle columns render '-', and the flexible
// column absorbs ~400px of empty space before the action button." Dropped
// the fixed 5-column grid for a two-line row (name+relation+action on one
// line, whatever's actually known about rhythm/last-contact/next-thing
// wrapped on the line below) -- there's no unnamed column left to be
// confused about, and a row with nothing to say in the second line just
// doesn't render one, instead of reserving ~400px of empty grid track for
// it. `rhythm`/`lastContact`/`nextThing` are all optional now; the caller
// passes null instead of a placeholder dash for "nothing here."
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
  rhythm?: React.ReactNode;
  lastContact?: React.ReactNode;
  nextThing?: React.ReactNode;
  action: React.ReactNode;
  /** Rows past cadence get a slipping-tinted border (Part 2). */
  slipping?: boolean;
  className?: string;
}) {
  const hasSecondLine = rhythm || lastContact || nextThing;
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-table-row border px-4 py-[14px] motion-safe-transition hover:border-line-strong",
        slipping ? "border-slipping/40" : "border-transparent",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">{person}</div>
        <div className="shrink-0">{action}</div>
      </div>
      {hasSecondLine && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-[46px] font-sans text-body text-ink-2">
          {rhythm}
          {lastContact && <span>{lastContact}</span>}
          {nextThing && <span>{nextThing}</span>}
        </div>
      )}
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
