import * as React from "react";
import { cn } from "@/lib/utils";

// Redesign (Part 3 — Component anatomy: Table row / general avatar spec).
// "Avatar 36×36, radius 11, 12.5/800 initials." Used everywhere a person
// needs a visual identity: People table, right panes, Gift group headers.
export function Avatar({
  name,
  src,
  size = 36,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const initials = getInitials(name);
  if (src) {
    // Avatar sources are arbitrary user-provided/external URLs, not part of
    // the Next.js image pipeline's known-domain set.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={cn("shrink-0 rounded-input object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-input bg-surface-2 font-sans text-avatar-initials text-ink-2",
        className
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
