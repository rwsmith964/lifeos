import * as React from "react";

import { cn } from "@/lib/utils";

// Redesign: same token set as Input (radius-input, surface/line/ink, action focus ring).
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-16 w-full rounded-input border border-line bg-surface px-3 py-2 font-sans text-body text-ink outline-none motion-safe-transition placeholder:text-meta focus-visible:ring-2 focus-visible:ring-action/50 focus-visible:border-line-strong disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
