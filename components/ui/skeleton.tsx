import * as React from "react";
import { cn } from "@/lib/utils";

// Redesign (Part 5 — States: Loading). "Skeletons that match the real
// layout's shape and height ... so nothing shifts when data lands. No
// spinners on full pages." Callers pass the exact height/width of the real
// content (e.g. a PriorityCard skeleton matches PriorityCard's own
// padding/line-heights) rather than this component guessing a shape.
// motion-reduce:animate-none respects Part 5's reduced-motion rule.
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse motion-reduce:animate-none rounded-input bg-surface-2", className)}
      {...props}
    />
  );
}
