import * as React from "react";

import { cn } from "@/lib/utils";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        // Redesign: bg-surface/border-line/radius-card, no shadow (Part 3:
        // "No shadows in dark mode; at most one soft shadow on raised white
        // cards in light mode" -- applied narrowly via dark: below rather
        // than a shadow every card carries by default).
        "bg-surface text-ink flex flex-col gap-4 rounded-card border border-line py-4 dark:shadow-none shadow-sm",
        className
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex flex-col gap-1 px-4", className)}
      {...props}
    />
  );
}

// C3/J1 (audit pass 2026-09-11): "Section titles are the same size as body
// text... none is a heading element." CardTitle always rendered a plain
// `<div>` regardless of context -- fine for a card that's genuinely one
// object among peers (a gift, a person row), but wrong for a page's own
// section headings, which need to be real heading elements for anyone
// navigating by heading (screen reader rotor, browser "jump to heading").
// `as` defaults to "div" so every existing CardTitle usage elsewhere is
// unaffected; pass `as="h2"` (or h3, etc.) where a title is really a page
// section heading.
function CardTitle({
  className,
  as: Tag = "div",
  ...props
}: React.ComponentProps<"div"> & { as?: "div" | "h2" | "h3" | "h4" }) {
  return (
    <Tag
      data-slot="card-title"
      className={cn("font-sans text-card-headline text-ink", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-meta text-body", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-4", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-4", className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
