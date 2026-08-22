import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { requireHouseholdContext } from "@/lib/auth/session";
import { listNotificationsForPerson } from "@/lib/db/repositories/system";
import { Card, CardContent } from "@/components/ui/card";
import { MarkAllReadButton, MarkReadButton } from "./notification-actions";

export default async function NotificationsPage() {
  const { supabase, selfPerson } = await requireHouseholdContext();
  const notifications = await listNotificationsForPerson(supabase, selfPerson.id);
  const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Notifications</h1>
        {unreadIds.length > 0 && <MarkAllReadButton notificationIds={unreadIds} />}
      </div>

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            Nothing yet — gift reminders and daily briefs will show up here.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {notifications.map((n) => {
            const content = (
              <Card className={n.read_at ? undefined : "border-primary"}>
                <CardContent className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{n.title}</p>
                    <p className="text-xs text-muted-foreground">{n.body}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  {!n.read_at && <MarkReadButton notificationId={n.id} />}
                </CardContent>
              </Card>
            );
            return n.link_path ? (
              <Link key={n.id} href={n.link_path}>
                {content}
              </Link>
            ) : (
              <div key={n.id}>{content}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
