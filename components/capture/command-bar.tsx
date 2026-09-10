"use client";

import { Mic, Search } from "lucide-react";
import { useCapture } from "./capture-provider";

// Redesign (Part 3 — Component anatomy: Command bar). "Height 40, radius
// 11, 0 14px padding, search icon then placeholder at 13.5/500 in meta,
// mic icon in action and a ⌘K kbd chip pushed right. Max width 520px in
// the header." A button styled as a search input, not a real input --
// clicking it (or ⌘K, handled globally by CaptureProvider) opens the
// actual capture overlay, which owns the real text field.
export function CommandBar({ className }: { className?: string }) {
  const { openCapture } = useCapture();
  return (
    <button
      type="button"
      onClick={openCapture}
      className={`flex h-10 w-full max-w-[520px] items-center gap-2 rounded-input border border-line bg-surface px-[14px] text-left motion-safe-transition hover:border-line-strong ${className ?? ""}`}
    >
      <Search className="size-4 shrink-0 text-meta" />
      <span className="flex-1 truncate font-sans text-[13.5px] font-medium text-meta">Ask, add, or dump a thought…</span>
      <Mic className="size-4 shrink-0 text-action" />
      <kbd className="shrink-0 rounded-chip border border-line-strong px-1.5 py-0.5 font-sans text-[11px] font-bold text-ink-2">
        ⌘K
      </kbd>
    </button>
  );
}
