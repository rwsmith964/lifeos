import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { requireHouseholdContext } from "@/lib/auth/session";
import { listNotificationsForPerson } from "@/lib/db/repositories/system";
import { Card, CardContent } from "@/components/ui/card";
import { RenderedMarkdown } from "@/components/ui/rendered-markdown";
import { MarkAllReadButton, MarkReadButton } from "./notification-actions";

// Notification bodies for daily_brief notifications are the exact markdown
// produced by lib/brief/render.ts, which always starts with a
// "## ${headline}" line -- and that same headline is also what
// dispatch.ts sets as the notification's own `title` (rendered separately,
// above, as its own heading). Left alone this duplicated the headline
// verbatim (P0-3). Strip a leading "## " line only when it echoes the
// title, rather than unconditionally, since gift_order_by/
// opportunity_detected notification bodies have no such heading at all and
// shouldn't have their first real line eaten.
function stripDuplicateHeading(body: string, title: string): string {
  const lines = body.split("\n");
  if (lines[0]?.trim().toLowerCase() === `## ${title.trim().toLowerCase()}`) {
    return lines.slice(1).join("\n").replace(/^\n+/, "");
  }
  return body;
}

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
                    <RenderedMarkdown
                      content={stripDuplicateHeading(n.body, n.title)}
                      className="text-xs text-muted-foreground [&>p]:mt-1 first:[&>p]:mt-0"
                    />
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
