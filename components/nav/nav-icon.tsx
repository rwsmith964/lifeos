"use client";

import { Bell, Brain, CalendarDays, Compass, Gift, House, Sun, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// A1/A2 (audit pass 2026-09-11): the server layout used to build each nav
// item's icon as a pre-rendered JSX element (`icon: <item.icon ... />`) and
// pass that element into SidebarNav/MobileCaptureButton, both Client
// Components. That looked safe (an element is "just data"), but an element
// whose `type` is a plain function/forwardRef component (every lucide-react
// icon) still carries that component reference in its serialized form when
// it crosses the server->client boundary as a PROP rather than literal JSX
// children -- only literal children get Next's "render this Server
// Component first" treatment. The result was a real (if non-fatal) dev
// warning: "Only plain objects can be passed to Client Components ...
// Classes or other objects with methods are not supported" on every nav
// render. Fix: send a plain string name across the boundary instead (100%
// serializable) and do the icon lookup/render here, inside the client tree.
export type NavIconName = "today" | "calendar" | "people" | "plan" | "household" | "gifts" | "brain-dump" | "notifications";

const ICONS: Record<NavIconName, LucideIcon> = {
  today: Sun,
  calendar: CalendarDays,
  people: Users,
  plan: Compass,
  household: House,
  gifts: Gift,
  "brain-dump": Brain,
  notifications: Bell,
};

export function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const Icon = ICONS[name];
  return <Icon className={className} />;
}
