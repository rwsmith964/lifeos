import Link from "next/link";
import { Bell, CalendarDays, Compass, Gift, Home, Settings, Users } from "lucide-react";
import { requireHouseholdContext } from "@/lib/auth/session";
import { listUnreadNotifications } from "@/lib/db/repositories/system";
import { APP_NAME } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { CaptureButton } from "@/components/capture/capture-button";
import { SignOutButton } from "./sign-out-button";

const NAV_ITEMS = [
  { href: "/", label: "Brief", icon: Home },
  { href: "/people", label: "People", icon: Users },
  { href: "/gifts", label: "Gifts", icon: Gift },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/activities", label: "Activities", icon: Compass },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { supabase, household, selfPerson } = await requireHouseholdContext();
  const unread = await listUnreadNotifications(supabase, selfPerson.id);

  return (
    <div className="flex min-h-dvh w-full flex-col lg:flex-row">
      {/* MOCKUP A — desktop sidebar (lg+ only). Mobile/tablet below lg is
          completely untouched: same top header, same fixed bottom nav. */}
      <aside className="hidden lg:flex lg:w-60 lg:shrink-0 lg:flex-col lg:border-r lg:bg-muted/30">
        <div className="px-5 py-5">
          <p className="text-sm font-semibold">{APP_NAME}</p>
          <p className="text-xs text-muted-foreground">{household.name}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <item.icon className="size-5" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center justify-between border-t px-3 py-3">
          <Link
            href="/notifications"
            aria-label={unread.length > 0 ? `Notifications (${unread.length} unread)` : "Notifications"}
            className="relative inline-flex p-2 text-muted-foreground hover:text-foreground"
          >
            <Bell className="size-5" />
            {unread.length > 0 && (
              <Badge className="absolute -top-1 -right-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]">
                {unread.length}
              </Badge>
            )}
          </Link>
          <SignOutButton />
        </div>
      </aside>

      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col lg:mx-0 lg:max-w-none lg:flex-1">
        <header className="flex items-center justify-between border-b px-4 py-3 lg:hidden">
          <div>
            <p className="text-sm font-semibold">{APP_NAME}</p>
            <p className="text-xs text-muted-foreground">{household.name}</p>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/notifications"
              aria-label={unread.length > 0 ? `Notifications (${unread.length} unread)` : "Notifications"}
              className="relative inline-flex p-2 text-muted-foreground hover:text-foreground"
            >
              <Bell className="size-5" />
              {unread.length > 0 && (
                <Badge className="absolute -top-1 -right-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]">
                  {unread.length}
                </Badge>
              )}
            </Link>
            <SignOutButton />
          </div>
        </header>

        {/* D-079 (P2-1): bottom padding matches the capture button's full
            footprint (bottom-24 offset + size-12/48px height = 144px = pb-36)
            so no page's own bottom-right controls (calendar event delete,
            gift budget Remove, activity Remove, etc.) render underneath the
            floating button when a list scrolls all the way down. Desktop
            (lg+) drops that reserved space since the capture button no
            longer floats bottom-right there. */}
        <main className="flex-1 overflow-y-auto pb-36 lg:pb-8">
          <div className="lg:mx-auto lg:max-w-6xl lg:px-8 lg:py-6">{children}</div>
        </main>

        <CaptureButton />

        <nav className="fixed bottom-0 mx-auto flex w-full max-w-md items-stretch border-t bg-background lg:hidden">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-1 flex-col items-center gap-1 py-2 text-muted-foreground hover:text-foreground"
            >
              <item.icon className="size-5" />
              <span className="text-[11px]">{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
