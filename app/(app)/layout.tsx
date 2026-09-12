import Link from "next/link";
import { Bell } from "lucide-react";
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
import { HeaderThemeToggle } from "@/components/header-theme-toggle";
import { SessionKeepAlive } from "@/components/session-keep-alive";
import { SignOutButton } from "./sign-out-button";
import { SidebarNav } from "./sidebar-nav";

// A2 (audit pass 2026-09-11): Household, Brain dump and Notifications had no
// nav entry at all -- reachable only via a Today card, the capture panel's
// "Brain dump ->" link, or the header bell, respectively. Grown from the
// prior redesign's 5-item list to the audit's explicit 8-item target list,
// in its stated order. Settings stays out of this list and pinned at the
// bottom via AvatarMenu, per the same target description. `icon` is a plain
// string name (see components/nav/nav-icon.tsx), not a component reference
// -- this array is passed into Client Components below, and a component
// reference (or even a pre-rendered element wrapping one) isn't reliably
// serializable across that boundary as a prop.
const NAV_ITEMS = [
  { href: "/", label: "Today", icon: "today" },
  { href: "/calendar", label: "Calendar", icon: "calendar" },
  { href: "/people", label: "People", icon: "people" },
  { href: "/activities", label: "Plan", icon: "plan" },
  { href: "/household", label: "Household", icon: "household" },
  { href: "/gifts", label: "Gifts", icon: "gifts" },
  { href: "/brain-dump", label: "Brain dump", icon: "brain-dump" },
  { href: "/notifications", label: "Notifications", icon: "notifications" },
] as const;

// Mobile bottom tab bar keeps only the original 4 (Part 6: "Gifts moves
// into an overflow or the People tab" -- the same reasoning now also
// covers Household, Brain dump and Notifications, none of which fit a
// 5-slot bar built around a centred capture button). Notifications stays
// reachable on mobile via the always-visible header bell; Household and
// Brain dump stay reachable via their existing in-app cross-links (Today's
// dinner card, the capture panel's "Brain dump ->" link) -- see QUESTIONS.md
// for this tradeoff logged against A2.
const MOBILE_NAV_ITEMS = NAV_ITEMS.slice(0, 4);
const MOBILE_NAV_LEFT = MOBILE_NAV_ITEMS.slice(0, 2);
const MOBILE_NAV_RIGHT = MOBILE_NAV_ITEMS.slice(2, 4);

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { supabase, household, selfPerson } = await requireHouseholdContext();
  // B-02: this runs on every page render (it's in the shared layout), and an
  // uncaught throw here escapes app/(app)/error.tsx entirely -- a layout's
  // own error boundary only catches errors from its children, never from the
  // layout itself, so this used to escalate all the way to the unstyled
  // root app/global-error.tsx (no sidebar, no fonts, no chrome) on any
  // transient failure (a Supabase 503, a dropped connection). The unread
  // count is cosmetic (just the bell badge), so fail soft here instead of
  // taking down every page in the app over it.
  let unread: Awaited<ReturnType<typeof listUnreadNotifications>> = [];
  try {
    unread = await listUnreadNotifications(supabase, selfPerson.id);
  } catch (error) {
    console.error("Failed to load unread notifications (non-fatal):", error);
  }
  const displayName = selfPerson.nickname || selfPerson.full_name;

  return (
    <AppLockGate>
      <CaptureProvider>
        <SessionKeepAlive />
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
            <SidebarNav items={NAV_ITEMS} />
            <div className="border-t border-line p-2 xl:p-3">
              <AvatarMenu name={displayName} householdName={household.name}>
                <SignOutButton />
              </AvatarMenu>
            </div>
          </aside>

          {/* Redesign Step 10 (responsive pass): min-w-0 is required here --
              without it, this flex item's default min-width:auto lets any
              wide descendant (e.g. the Calendar week grid's own
              horizontally-scrollable, minWidth-pinned track) bubble its
              intrinsic width up through flex-1/flex-col ancestors that
              never otherwise constrain width, pushing the whole shell wider
              than the viewport and forcing the page itself to scroll
              horizontally -- exactly what Part 3's layout rules forbid.
              Caught via live viewport testing at 1024px, not by build/lint. */}
          <div className="flex min-h-dvh w-full min-w-0 flex-1 flex-col">
            {/* Header: 72px, hairline border below (Part 3 -- Layout). */}
            <header className="flex h-[72px] items-center gap-3 border-b border-line px-4 md:px-[34px]">
              <div className="md:hidden">
                <p className="font-sans text-card-headline text-ink">{APP_NAME}</p>
              </div>
              <CommandBar className="hidden md:flex" />
              <div className="ml-auto flex items-center gap-2">
                <HeaderThemeToggle />
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
