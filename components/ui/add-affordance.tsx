"use client";

import { useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// C2 (audit pass 2026-09-11): "Every section is an open, empty form...
// The page reads as data entry even when you only came to look something
// up." Wraps an Add*Form so it's collapsed behind a real affordance by
// default -- the form itself is unchanged, just not mounted until someone
// actually asks to add something. `label` is the button text (e.g. "Add
// interest"); `children` is the existing add-form, rendered only while open.
export function AddAffordance({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="self-start" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> {label}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-sans text-metadata font-bold text-ink-2">{label}</span>
        <Button variant="ghost" size="icon" aria-label="Cancel" onClick={() => setOpen(false)}>
          <X className="size-4" />
        </Button>
      </div>
      {children}
    </div>
  );
}
