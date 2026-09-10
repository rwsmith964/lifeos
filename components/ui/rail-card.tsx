import * as React from "react";
import { cn } from "@/lib/utils";

// Redesign (Part 3 — Component anatomy: Rail card). "Padding 18px 18px
// 16px, radius 14, section label then 11-13px gap then content." Used for
// every right-rail panel across Today/People/Plan/Gifts.
export function RailCard({
  sectionLabel,
  children,
  className,
}: {
  sectionLabel: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col rounded-card border border-line bg-surface px-[18px] pt-[18px] pb-4", className)}>
      <p className="font-sans text-section-label uppercase text-meta">{sectionLabel}</p>
      <div className="flex flex-col gap-3 pt-3">{children}</div>
    </div>
  );
}
