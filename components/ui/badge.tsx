import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Redesign (docs/redesign-brief.md Part 3 — Component anatomy: Tag).
// This is the brief's "Tag" primitive under its pre-existing name/API
// (Badge) -- see components/ui/button.tsx's doc comment for why prop
// VALUES stay stable across the redesign. `default`/`secondary`/
// `destructive`/`outline` are the pre-existing variants, restyled to the
// new tokens; `action`/`settled`/`slipping`/`custody-you`/`custody-mel`/
// `neutral` are new, added for Part 2's category-tag system (Today's
// Reach out/Decide/Quick/Settled tags and the custody colour bands).
const badgeVariants = cva(
  "inline-flex items-center justify-center h-[21px] rounded-chip border border-transparent px-[9px] font-sans text-tag uppercase w-fit whitespace-nowrap shrink-0 gap-1",
  {
    variants: {
      variant: {
        default: "bg-action-soft-bg text-action-soft-fg",
        secondary: "bg-surface-2 text-ink-2",
        destructive: "bg-destructive-soft-bg text-destructive-soft-fg",
        outline: "border-line-strong text-ink-2",
        action: "bg-action-soft-bg text-action-soft-fg",
        settled: "bg-settled-soft-bg text-settled-soft-fg",
        slipping: "bg-slipping-soft-bg text-slipping-soft-fg",
        "custody-you": "bg-custody-you-soft-bg text-custody-you-soft-fg",
        "custody-mel": "bg-custody-mel-soft-bg text-custody-mel-soft-fg",
        neutral: "bg-surface-2 text-meta",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
