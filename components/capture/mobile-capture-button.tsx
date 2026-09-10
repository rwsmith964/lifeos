"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mic } from "lucide-react";
import type { ReactNode } from "react";
import { useCapture } from "./capture-provider";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  // A rendered icon element, not a component reference: the parent server
  // component can't pass a component/function as a prop across the
  // server/client boundary ("Functions cannot be passed directly to Client
  // Components"), but an already-rendered JSX element is plain
  // serializable data and crosses that boundary fine.
  icon: ReactNode;
}

// Redesign (Part 6 — Responsive, <768px): "Sidebar becomes a bottom tab
// bar: Today · People · capture (a 52px circular action-coloured button,
// centred, with the mic icon) · Calendar · Plan." Gifts is deliberately
// not one of the five slots here (Part 6: "Gifts moves into an overflow
// or the People tab") -- reachable from the People page or its own nav
// link once a viewer is past the phone breakpoint.
export function MobileCaptureButton({ leftItems, rightItems }: { leftItems: NavItem[]; rightItems: NavItem[] }) {
  const pathname = usePathname();
  const { openCapture } = useCapture();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-line bg-surface md:hidden">
      {leftItems.map((item) => (
        <TabLink key={item.href} item={item} active={pathname === item.href} />
      ))}
      <div className="flex flex-1 items-center justify-center">
        <button
          type="button"
          onClick={openCapture}
          aria-label="Ask, add, or dump a thought"
          className="-mt-6 flex size-[52px] items-center justify-center rounded-full bg-action text-on-action shadow-sm motion-safe-transition hover:bg-action/90"
        >
          <Mic className="size-5" />
        </button>
      </div>
      {rightItems.map((item) => (
        <TabLink key={item.href} item={item} active={pathname === item.href} />
      ))}
    </nav>
  );
}

function TabLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-1 py-2 font-sans text-[11px] font-bold motion-safe-transition",
        active ? "text-action" : "text-meta hover:text-ink-2"
      )}
    >
      {item.icon}
      {item.label}
    </Link>
  );
}
