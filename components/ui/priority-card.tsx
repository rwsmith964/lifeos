import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";

// Redesign (docs/redesign-brief.md Part 2 — Today, Part 3 — Component
// anatomy: Priority card). The Today stack's core unit: icon well, a tag
// row (category tag + metadata), a one-sentence headline, optional detail,
// and one primary + up to two ghost actions. Part 7: "A card without an
// action ... does not belong on this page" — this component always
// requires `actions`, nothing optional about it, so a card literally
// cannot be built without one.
export interface PriorityCardProps {
  icon: React.ReactNode;
  tagLabel: string;
  tagVariant: VariantProps<typeof badgeVariants>["variant"];
  metadata: string;
  headline: string;
  detail?: React.ReactNode;
  actions: React.ReactNode;
  /** A card with only a one-line item collapses to a single horizontal row (Part 3). */
  collapsed?: boolean;
  className?: string;
}

export function PriorityCard({
  icon,
  tagLabel,
  tagVariant,
  metadata,
  headline,
  detail,
  actions,
  collapsed = false,
  className,
}: PriorityCardProps) {
  if (collapsed) {
    return (
      <div className={cn("flex items-center gap-[18px] rounded-card border border-line bg-surface px-[22px] py-[15px]", className)}>
        <IconWell tagVariant={tagVariant}>{icon}</IconWell>
        <p className="min-w-0 flex-1 truncate font-sans text-card-headline text-ink">{headline}</p>
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      </div>
    );
  }

  return (
    <div className={cn("flex gap-[18px] rounded-card border border-line bg-surface px-[22px] py-5", className)}>
      <IconWell tagVariant={tagVariant}>{icon}</IconWell>
      <div className="flex min-w-0 flex-1 flex-col gap-[9px]">
        <div className="flex items-center gap-[10px]">
          <Badge variant={tagVariant}>{tagLabel}</Badge>
          <span className="font-sans text-metadata text-meta">{metadata}</span>
        </div>
        <p className="font-sans text-card-headline text-ink text-pretty">{headline}</p>
        {detail && <div className="font-sans text-body text-ink-2">{detail}</div>}
        <div className="flex items-center gap-2 pt-2">{actions}</div>
      </div>
    </div>
  );
}

function IconWell({
  children,
  tagVariant,
}: {
  children: React.ReactNode;
  tagVariant: VariantProps<typeof badgeVariants>["variant"];
}) {
  const bg = ICON_WELL_BG[tagVariant ?? "action"] ?? ICON_WELL_BG.action;
  const fg = ICON_WELL_FG[tagVariant ?? "action"] ?? ICON_WELL_FG.action;
  return (
    <div
      className={cn("flex size-[38px] shrink-0 items-center justify-center rounded-icon-well [&_svg]:size-5", bg, fg)}
    >
      {children}
    </div>
  );
}

// Icon well background/foreground per role (Part 3: "38×38 icon well
// (radius 10, role-tinted background at ~12%)") -- keyed by the same Tag
// variant names so a card's icon well always matches its own tag colour.
const ICON_WELL_BG: Record<string, string> = {
  default: "bg-action-soft-bg",
  action: "bg-action-soft-bg",
  settled: "bg-settled-soft-bg",
  slipping: "bg-slipping-soft-bg",
  "custody-you": "bg-custody-you-soft-bg",
  "custody-mel": "bg-custody-mel-soft-bg",
  neutral: "bg-surface-2",
  secondary: "bg-surface-2",
  destructive: "bg-destructive-soft-bg",
  outline: "bg-surface-2",
};

const ICON_WELL_FG: Record<string, string> = {
  default: "text-action-soft-fg",
  action: "text-action-soft-fg",
  settled: "text-settled-soft-fg",
  slipping: "text-slipping-soft-fg",
  "custody-you": "text-custody-you-soft-fg",
  "custody-mel": "text-custody-mel-soft-fg",
  neutral: "text-meta",
  secondary: "text-ink-2",
  destructive: "text-destructive-soft-fg",
  outline: "text-ink-2",
};
