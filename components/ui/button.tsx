import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Redesign (docs/redesign-brief.md Part 3 — Component anatomy: Button).
// Height 36 default / 44 minimum on touch below 768px (baked in now via the
// md: breakpoint rather than deferred to the Step 10 responsive pass --
// cheap to do once here, and Part 8's Definition of Done requires it on
// every control). Destructive uses the RQ2/RQ3 `destructive` token (never
// `slipping` -- see QUESTIONS.md RQ3).
//
// Variant/size prop VALUES are unchanged from the pre-redesign component on
// purpose: this button is used across ~15 routes the brief's five named
// screens don't touch (Household, Opportunities, Packing, Execution,
// Ambient, Brain Dump, childcare, trip ideas, …). Renaming the API would
// force a mechanical edit of every call site across the whole app just to
// keep it compiling -- out of scope ("do not change ... the API surface ...
// except where a section explicitly moves"). Only the CSS each variant
// resolves to changes. `outline` and `ghost` intentionally render
// identically: Part 3's one non-primary/non-destructive treatment
// ("Ghost: transparent, ink-2 text, line-strong border") is visually closer
// to this component's pre-existing `outline` than its pre-existing `ghost`
// (which had no border at rest) -- both names now produce that one look.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-[7px] whitespace-nowrap rounded-control font-sans text-[13.5px] font-bold motion-safe-transition disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-transparent disabled:text-meta disabled:border-line [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-action/50",
  {
    variants: {
      variant: {
        default: "bg-action text-on-action hover:bg-action/90 border border-transparent",
        destructive: "bg-destructive-soft-bg text-destructive-soft-fg border border-transparent hover:opacity-90",
        outline: "bg-transparent text-ink-2 border border-line-strong hover:bg-surface-2 hover:text-ink",
        secondary: "bg-surface-2 text-ink border border-transparent hover:bg-surface-2/70",
        ghost: "bg-transparent text-ink-2 border border-line-strong hover:bg-surface-2 hover:text-ink",
        link: "text-action underline-offset-4 hover:underline h-auto px-0 border-none",
      },
      size: {
        default: "h-control-touch md:h-control-default px-4",
        sm: "h-control-compact px-3 text-[12.5px]",
        lg: "h-control-touch md:h-control-default px-6",
        icon: "size-control-touch md:size-control-default px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
