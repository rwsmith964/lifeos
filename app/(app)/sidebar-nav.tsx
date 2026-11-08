"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NavIcon, type NavIconName } from "@/components/nav/nav-icon";

export interface SidebarNavItem {
  href: string;
  label: string;
  // A plain string name, not a component reference or a pre-rendered
  // element -- see nav-icon.tsx's doc comment for why even a pre-rendered
  // JSX element isn't safely serializable when it crosses the server/client
  // boundary as a prop rather than literal children.
  icon: NavIconName;
}

// A1/A2 (audit pass 2026-09-11): the sidebar previously showed labels only
// at the xl+ (1280px) breakpoint -- everywhere from 768-1279px it was a
// 72px rail of bare icons with the label reachable only via a hover title
// tooltip, and there was no active-page indicator at all. This client
// component (needs usePathname(), so it can't live in the async server
// layout directly -- same reason MobileCaptureButton's TabLink is a client
// component) renders every item with a visible label at every width the
// sidebar itself is shown (icon above label in the compact md-xl rail,
// icon beside label at xl+, matching the compact bottom-tab-bar's own
// icon-above-label convention instead of inventing a new pattern), plus a
// real active-state treatment and aria-current="page".
export function SidebarNav({ items }: { items: readonly SidebarNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-1 px-2 xl:px-3">
      {items.map((item) => {
        const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-1 rounded-control px-2 py-2 text-center font-sans text-[10.5px] font-bold motion-safe-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/50 xl:flex-row xl:justify-start xl:gap-3 xl:px-3 xl:text-left xl:text-body xl:font-normal",
              active ? "bg-surface-2 text-action" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
            )}
          >
            <NavIcon name={item.icon} className="size-5 shrink-0" />
            <span className="leading-tight">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
