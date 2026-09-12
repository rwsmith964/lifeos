"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mic } from "lucide-react";
import { useCapture } from "./capture-provider";
import { cn } from "@/lib/utils";
import { NavIcon, type NavIconName } from "@/components/nav/nav-icon";

interface NavItem {
  href: string;
  label: string;
  // A plain string name, not a component reference or a pre-rendered
  // element -- see nav-icon.tsx's doc comment: a Server Component can't
  // safely pass a component reference, or even an element wrapping one,
  // across the boundary as a PROP (only literal JSX children get resolved
  // server-side automatically).
  icon: NavIconName;
}

// Redesign (Part 6 — Responsive, <768px): "Sidebar becomes a bottom tab
// bar: Today · People · capture (a 52px circular action-coloured button,
// centred, with the mic icon) · Calendar · Plan." Gifts is deliberately
// not one of the five slots here (Part 6: "Gifts moves into an overflow
// or the People tab") -- reachable from the People page or its own nav
// link once a viewer is past the phone breakpoint.
function isActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

export function MobileCaptureButton({ leftItems, rightItems }: { leftItems: NavItem[]; rightItems: NavItem[] }) {
  const pathname = usePathname();
  const { openCapture } = useCapture();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-line bg-surface md:hidden">
      {leftItems.map((item) => (
        <TabLink key={item.href} item={item} active={isActive(pathname, item.href)} />
      ))}
      <div className="flex flex-1 items-center justify-center">
        <button
          type="button"
          onClick={openCapture}
          aria-label="Add or dump a thought"
          className="-mt-6 flex size-[52px] items-center justify-center rounded-full bg-action text-on-action shadow-sm motion-safe-transition hover:bg-action/90"
        >
          <Mic className="size-5" />
        </button>
      </div>
      {rightItems.map((item) => (
        <TabLink key={item.href} item={item} active={isActive(pathname, item.href)} />
      ))}
    </nav>
  );
}

function TabLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-1 py-2 font-sans text-[11px] font-bold motion-safe-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/50",
        active ? "text-action" : "text-meta hover:text-ink-2"
      )}
    >
      <NavIcon name={item.icon} className="size-5" />
      {item.label}
    </Link>
  );
}
