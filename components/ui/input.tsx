import * as React from "react";

import { cn } from "@/lib/utils";

// Redesign (docs/redesign-brief.md Part 3): radius-input (11px), control
// height (44px touch / 36px default, same md: breakpoint pattern as
// Button), surface/line/ink tokens, focus ring in the action colour.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-control-touch md:h-control-default w-full min-w-0 rounded-input border border-line bg-surface px-3 font-sans text-body text-ink outline-none motion-safe-transition file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-meta focus-visible:ring-2 focus-visible:ring-action/50 focus-visible:border-line-strong disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Input };
