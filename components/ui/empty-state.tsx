import * as React from "react";
import { cn } from "@/lib/utils";

// Redesign (Part 5 — States: Empty). "An empty state says what the system
// needs and gives one action ... never a bare 'No results'." Distinguishes
// empty-by-success ("Nothing needs you today") from empty-by-absence
// ("You haven't added any activities yet") purely via the message text each
// call site supplies -- this component doesn't encode that distinction
// itself, since only the caller knows which kind of empty it is.
export function EmptyState({
  icon,
  message,
  action,
  className,
}: {
  icon?: React.ReactNode;
  message: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-card border border-dashed border-line px-[22px] py-[34px] text-center", className)}>
      {icon && <div className="text-meta [&_svg]:size-6">{icon}</div>}
      <p className="max-w-[36ch] font-sans text-body text-ink-2">{message}</p>
      {action}
    </div>
  );
}
