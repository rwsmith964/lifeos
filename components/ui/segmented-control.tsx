"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Redesign primitive, generalized from the pre-existing components/
// theme-toggle.tsx pattern (kept in place for now, not yet migrated onto
// this shared component -- see docs/redesign-log.md Step 9). Used by
// Calendar's Day/Week/Month/Agenda control and, later, the Settings
// palette picker.
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  "aria-label": ariaLabel,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  "aria-label": string;
  className?: string;
}) {
  return (
    <div
      className={cn("inline-flex items-center gap-1 rounded-control border border-line bg-surface-2 p-1", className)}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex h-control-compact items-center gap-1.5 rounded-chip px-3 font-sans text-[12.5px] font-bold motion-safe-transition",
              isActive ? "bg-surface text-ink shadow-sm" : "text-meta hover:text-ink-2"
            )}
          >
            {option.icon && <option.icon className="size-4" />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
