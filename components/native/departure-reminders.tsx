"use client";

// Schedules "leave in 15 minutes" and "time to go" notifications on the phone
// for the drives on the calendar. Uses on-device (local) notifications, so no
// push servers or Apple/Google credentials are involved, and they fire even
// with the app closed. Re-syncs whenever the app opens, so rescheduled or new
// plans are picked up. Does nothing in a normal browser.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { LocalNotifications } from "@capacitor/local-notifications";
import { planReminders, type DepartureEvent } from "@/lib/reminders/departures";

export const DEPARTURE_REMINDERS_PREF_KEY = "lifeos:departure-reminders";
const ACTION_TYPE_ID = "DEPARTURE";
const SYNC_EVERY_MS = 30 * 60 * 1000;

export function isDepartureRemindersAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("LocalNotifications");
}

export function departureRemindersEnabled(): boolean {
  try {
    return localStorage.getItem(DEPARTURE_REMINDERS_PREF_KEY) === "on";
  } catch {
    return false;
  }
}

/** Replace every scheduled departure notification with the current plan. */
export async function syncDepartureReminders(): Promise<number> {
  if (!isDepartureRemindersAvailable() || !departureRemindersEnabled()) return 0;

  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== "granted") return 0;

  const res = await fetch("/api/reminders/departures", { cache: "no-store" });
  if (!res.ok) return 0;
  const { departures } = (await res.json()) as { departures: DepartureEvent[] };
  const reminders = planReminders(departures, new Date());

  // Clear what we scheduled before (any pending notification of ours), then set the new set.
  const pending = await LocalNotifications.getPending();
  const ours = pending.notifications.filter((n) => n.extra?.lifeosDeparture);
  if (ours.length > 0) await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) });

  if (reminders.length === 0) return 0;
  await LocalNotifications.schedule({
    notifications: reminders.map((r) => ({
      id: r.notificationId,
      title: r.title,
      body: r.body,
      schedule: { at: r.fireAt, allowWhileIdle: true },
      actionTypeId: ACTION_TYPE_ID,
      extra: { lifeosDeparture: true, eventId: r.eventId, kind: r.kind },
    })),
  });
  return reminders.length;
}

/** Ask for permission (shows the system prompt the first time). */
export async function requestDepartureReminderPermission(): Promise<boolean> {
  if (!isDepartureRemindersAvailable()) return false;
  const result = await LocalNotifications.requestPermissions();
  return result.display === "granted";
}

export function DepartureReminders() {
  const router = useRouter();

  useEffect(() => {
    if (!isDepartureRemindersAvailable()) return;
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    const sync = () => {
      if (cancelled) return;
      void syncDepartureReminders().catch((error) => console.error("Departure reminder sync failed:", error));
    };

    void (async () => {
      // A "Navigate" button on the notification; tapping the notification itself does the same.
      await LocalNotifications.registerActionTypes({
        types: [{ id: ACTION_TYPE_ID, actions: [{ id: "navigate", title: "Navigate", foreground: true }] }],
      });
      const action = await LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
        const eventId = event.notification.extra?.eventId as string | undefined;
        if (eventId) router.push(`/depart/${eventId}`);
      });
      cleanups.push(() => void action.remove());
      const state = await CapacitorApp.addListener("appStateChange", ({ isActive }) => {
        if (isActive) sync();
      });
      cleanups.push(() => void state.remove());
    })();

    sync();
    const timer = window.setInterval(sync, SYNC_EVERY_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      cleanups.forEach((fn) => fn());
    };
  }, [router]);

  return null;
}
