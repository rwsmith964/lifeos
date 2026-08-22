"use client";

import { useTransition } from "react";
import { markAllNotificationsReadAction, markNotificationReadAction } from "./actions";
import { Button } from "@/components/ui/button";

export function MarkReadButton({ notificationId }: { notificationId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        startTransition(() => markNotificationReadAction(notificationId));
      }}
    >
      Mark read
    </Button>
  );
}

export function MarkAllReadButton({ notificationIds }: { notificationIds: string[] }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => startTransition(() => markAllNotificationsReadAction(notificationIds))}
    >
      Mark all read
    </Button>
  );
}
