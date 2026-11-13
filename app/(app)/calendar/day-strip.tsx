"use client";

// A row of days you can swipe left and right, centered on the day being viewed.
// Each day is a link, so picking one opens that day.
import { useEffect, useRef } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface DayStripDay {
  key: string;
  href: string;
  dow: string;
  dom: string;
  /** Month abbreviation, set only on the first day shown and the 1st of each month. */
  month: string | null;
  label: string;
  isToday: boolean;
}

export function DayStrip({ days, selectedKey }: { days: DayStripDay[]; selectedKey: string }) {
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = scroller.current;
    const selected = box?.querySelector<HTMLElement>('[aria-current="date"]');
    if (!box || !selected) return;
    box.scrollLeft = selected.offsetLeft - box.clientWidth / 2 + selected.offsetWidth / 2;
  }, [selectedKey]);

  return (
    <div
      ref={scroller}
      className="relative -mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
      aria-label="Pick a day"
    >
      {days.map((d) => {
        const selected = d.key === selectedKey;
        return (
          <Link
            key={d.key}
            href={d.href}
            aria-label={d.label}
            aria-current={selected ? "date" : undefined}
            className={cn(
              "flex w-[52px] shrink-0 flex-col items-center rounded-control py-1.5 font-sans text-[11px]",
              selected ? "bg-action text-on-action" : "bg-surface-2 text-ink-2",
              !selected && d.isToday && "font-bold text-action"
            )}
          >
            <span className="h-3 text-[9px] uppercase opacity-70">{d.month ?? ""}</span>
            <span>{d.dow}</span>
            <span className="text-sm font-medium">{d.dom}</span>
          </Link>
        );
      })}
    </div>
  );
}
