import Link from "next/link";
import { Bell, CalendarDays, Compass, Gift, Home, Settings, Users } from "lucide-react";
import { requireHouseholdContext } from "@/lib/auth/session";
import { listUnreadNotifications } from "@/lib/db/repositories/system";
import { signOut } from "../(auth)/actions";
import { APP_NAME } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-sm font-semibold">{APP_NAME}</p>
          <p className="text-xs text-muted-foreground">{household.name}</p>
        </div>
        <div className="flex items-center gap-1">
          <Link href="/notifications" className="relative inline-flex p-2 text-muted-foreground hover:text-foreground">
            <Bell className="size-5" />
            {unread.length > 0 && (
              <Badge className="absolute -top-1 -right-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]">
                {unread.length}
              </Badge>
            )}
          </Link>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-20">{children}</main>

      <nav className="fixed bottom-0 mx-auto flex w-full max-w-md items-stretch border-t bg-background">
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
  );
}
