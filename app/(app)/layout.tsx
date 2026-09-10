import Link from "next/link";
import { Bell, CalendarDays, Compass, Gift, Sun, Users } from "lucide-react";
import { requireHouseholdContext } from "@/lib/auth/session";
import { listUnreadNotifications } from "@/lib/db/repositories/system";
import { APP_NAME } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { AvatarMenu } from "@/components/ui/avatar-menu";
import { CaptureProvider } from "@/components/capture/capture-provider";
import { CommandBar } from "@/components/capture/command-bar";
import { MobileCaptureButton } from "@/components/capture/mobile-capture-button";
import { AppLockGate } from "@/components/native/app-lock-gate";
import { SignOutButton } from "./sign-out-button";

// Redesign (Part 2 — Information architecture): five destinations
// replacing the old six. Settings moved into the avatar menu; Notifications
// moved into the header bell; Quick capture moved into the header command
// bar / mobile tab-bar button (see components/capture/*). Route paths are
// unchanged (Activities' route still serves what's now labelled "Plan" --
// the brief absorbs Activities into Plan as a relabel + rebuild, not a new
// route, per Part 2's table).
const NAV_ITEMS = [
  { href: "/", label: "Today", icon: Sun },
  { href: "/people", label: "People", icon: Users },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/activities", label: "Plan", icon: Compass },
  { href: "/gifts", label: "Gifts", icon: Gift },
] as const;

// Mobile bottom tab bar drops Gifts (Part 6: "Gifts moves into an overflow
// or the People tab") and splits around the centred capture button. Icons
// are pre-rendered to JSX here (not passed as bare component references)
// since MobileCaptureButton is a Client Component -- see its own doc
// comment for why that distinction matters.
const MOBILE_NAV_ITEMS = NAV_ITEMS.map((item) => ({
  href: item.href,
  label: item.label,
  icon: <item.icon className="size-5" />,
}));
const MOBILE_NAV_LEFT = MOBILE_NAV_ITEMS.slice(0, 2);
const MOBILE_NAV_RIGHT = MOBILE_NAV_ITEMS.slice(2, 4);

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { supabase, household, selfPerson } = await requireHouseholdContext();
  const unread = await listUnreadNotifications(supabase, selfPerson.id);
  const displayName = selfPerson.nickname || selfPerson.full_name;

  return (
    <AppLockGate>
      <CaptureProvider>
        <div className="flex min-h-dvh w-full bg-ground">
          {/* Sidebar: hidden below md (768), 72px icon rail 768-1279, full
              244px at xl+ (1280) -- Part 6's three breakpoints exactly. */}
          <aside className="hidden md:flex md:w-[72px] md:shrink-0 md:flex-col md:border-r md:border-line md:bg-surface xl:w-[244px]">
            <div className="flex items-center gap-2 px-3 py-5 xl:px-5">
              <span className="font-sans text-card-headline font-bold text-ink xl:hidden" aria-hidden="true">
                {APP_NAME[0]}
              </span>
              <div className="hidden xl:block">
                <p className="font-sans text-card-headline text-ink">{APP_NAME}</p>
                <p className="font-sans text-metadata text-meta">{household.name}</p>
              </div>
            </div>
            <nav className="flex flex-1 flex-col gap-1 px-2 xl:px-3">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className="flex items-center gap-3 rounded-control px-3 py-2 font-sans text-body text-ink-2 motion-safe-transition hover:bg-surface-2 hover:text-ink"
                >
                  <item.icon className="size-5 shrink-0" />
                  <span className="hidden xl:inline">{item.label}</span>
                </Link>
              ))}
            </nav>
            <div className="border-t border-line p-2 xl:p-3">
              <AvatarMenu name={displayName} householdName={household.name} className="xl:block">
                <SignOutButton />
              </AvatarMenu>
            </div>
          </aside>

          <div className="flex min-h-dvh w-full flex-1 flex-col">
            {/* Header: 72px, hairline border below (Part 3 -- Layout). */}
            <header className="flex h-[72px] items-center gap-3 border-b border-line px-4 md:px-[34px]">
              <div className="md:hidden">
                <p className="font-sans text-card-headline text-ink">{APP_NAME}</p>
              </div>
              <CommandBar className="hidden md:flex" />
              <div className="ml-auto flex items-center gap-2">
                <Link
                  href="/notifications"
                  aria-label={unread.length > 0 ? `Notifications (${unread.length} unread)` : "Notifications"}
                  className="relative inline-flex size-control-default items-center justify-center rounded-control border border-line text-ink-2 motion-safe-transition hover:border-line-strong hover:text-ink"
                >
                  <Bell className="size-5" />
                  {unread.length > 0 && (
                    <Badge
                      variant="slipping"
                      className="absolute -top-1.5 -right-1.5 h-[18px] min-w-[18px] justify-center px-1"
                    >
                      {unread.length}
                    </Badge>
                  )}
                </Link>
                {/* Mobile only: sidebar's AvatarMenu isn't rendered below md,
                    so a plain link to Settings covers that same destination. */}
                <Link href="/settings" aria-label="Settings" className="md:hidden">
                  <Avatar name={displayName} size={36} />
                </Link>
              </div>
            </header>

            <main className="flex-1 overflow-y-auto pb-24 md:pb-8">
              <div className="mx-auto max-w-6xl px-4 py-[26px] md:px-[34px]">{children}</div>
            </main>

            <MobileCaptureButton
              leftItems={MOBILE_NAV_LEFT}
              rightItems={MOBILE_NAV_RIGHT}
            />
          </div>
        </div>
      </CaptureProvider>
    </AppLockGate>
  );
}
