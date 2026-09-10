"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Settings } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

// Redesign (Part 2): "Settings → an avatar menu at the bottom of the
// sidebar." Hand-rolled popover (click-outside + Escape), matching this
// codebase's existing no-external-dependency convention for this class of
// component (see components/ui/dialog.tsx's own doc comment) rather than
// adding a new Radix package for one two-item menu.
export function AvatarMenu({
  name,
  householdName,
  children,
  className,
}: {
  name: string;
  householdName?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-control px-2 py-2 text-left motion-safe-transition hover:bg-surface-2"
      >
        <Avatar name={name} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-sans text-metadata font-bold text-ink">{name}</p>
          {householdName && <p className="truncate font-sans text-[11px] text-meta">{householdName}</p>}
        </div>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-50 mb-2 w-48 rounded-card border border-line bg-surface p-1 shadow-sm"
        >
          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-control px-3 py-2 font-sans text-body text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <Settings className="size-4" />
            Settings
          </Link>
          <div className="px-1 py-1">{children}</div>
        </div>
      )}
    </div>
  );
}
