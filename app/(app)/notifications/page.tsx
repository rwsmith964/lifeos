import { requireHouseholdContext } from "@/lib/auth/session";
import { listNotificationsForPerson } from "@/lib/db/repositories/system";
import { MarkAllReadButton } from "./notification-actions";
import { NotificationsList } from "./notifications-list";

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

      <NotificationsList notifications={notifications} />
    </div>
  );
}
