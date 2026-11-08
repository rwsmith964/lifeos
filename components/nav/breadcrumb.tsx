import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

// A4 (audit pass 2026-09-11): "Exactly one screen has a breadcrumb
// (Settings / Activity). Person pages have a small '<- People'. Most
// pages have neither." One shared component, one pattern -- the caller
// supplies its own trail (a plain items array, not path-derived magic)
// since each nested page already knows its own context (a person's name,
// an activity's title) better than any route-matching heuristic could.
// The last item renders as the current page, not a link.
export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 font-sans text-metadata text-meta">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3 shrink-0" aria-hidden="true" />}
            {item.href && !isLast ? (
              <Link href={item.href} className="hover:text-ink hover:underline">
                {item.label}
              </Link>
            ) : (
              <span aria-current={isLast ? "page" : undefined} className={isLast ? "text-ink" : undefined}>
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
