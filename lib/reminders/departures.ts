// Departure reminders: "leave in 15 minutes", then "time to go" with a button
// that opens turn-by-turn navigation. Pure: turns the drive blocks on the
// calendar into the notifications the phone should schedule, and builds the
// links that open the person's own maps app.
export interface DepartureEvent {
  id: string;
  /** Wall-clock start of the drive (naive local "yyyy-MM-ddTHH:mm:ss"). */
  startLocal: string;
  title: string;
  destinationName: string;
  lat: number;
  lng: number;
}

export type ReminderKind = "heads_up" | "depart";

export interface PlannedReminder {
  /** Stable 31-bit id so rescheduling replaces the same notification instead of stacking. */
  notificationId: number;
  eventId: string;
  kind: ReminderKind;
  fireAt: Date;
  title: string;
  body: string;
}

export const HEADS_UP_MINUTES = 15;
/** How far ahead the phone schedules; it re-syncs whenever the app opens. */
export const REMINDER_HORIZON_HOURS = 36;

/** FNV-1a, folded to a positive 31-bit int (the id type local notifications accept). */
export function stableNotificationId(eventId: string, kind: ReminderKind): number {
  const text = `${eventId}:${kind}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) & 0x7fffffff;
}

function parseLocal(local: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), 0, 0);
}

export function planReminders(events: DepartureEvent[], now: Date): PlannedReminder[] {
  const horizon = new Date(now.getTime() + REMINDER_HORIZON_HOURS * 60 * 60 * 1000);
  const out: PlannedReminder[] = [];

  for (const event of events) {
    const start = parseLocal(event.startLocal);
    if (!start || start > horizon) continue;

    const headsUpAt = new Date(start.getTime() - HEADS_UP_MINUTES * 60 * 1000);
    if (headsUpAt > now) {
      out.push({
        notificationId: stableNotificationId(event.id, "heads_up"),
        eventId: event.id,
        kind: "heads_up",
        fireAt: headsUpAt,
        title: `Leave in ${HEADS_UP_MINUTES} minutes`,
        body: `Head to ${event.destinationName} soon.`,
      });
    }
    if (start > now) {
      out.push({
        notificationId: stableNotificationId(event.id, "depart"),
        eventId: event.id,
        kind: "depart",
        fireAt: start,
        title: "Time to go",
        body: `Leave now for ${event.destinationName}. Tap to navigate.`,
      });
    }
  }
  return out.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
}

export interface NavigationLinks {
  /** The phone's own maps app: Apple Maps on iOS, the system's default on Android. */
  native: string;
  apple: string;
  google: string;
  waze: string;
}

export type MobilePlatform = "ios" | "android" | "other";

export function detectPlatform(userAgent: string): MobilePlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "other";
}

export function navigationLinks(dest: { lat: number; lng: number; label: string }, platform: MobilePlatform): NavigationLinks {
  const ll = `${dest.lat},${dest.lng}`;
  const label = encodeURIComponent(dest.label);
  const apple = `https://maps.apple.com/?daddr=${ll}&dirflg=d&q=${label}`;
  const google = `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=driving`;
  const waze = `https://waze.com/ul?ll=${ll}&navigate=yes`;
  // Android: a geo: link opens whichever maps app the person has chosen as default.
  const native = platform === "android" ? `geo:0,0?q=${ll}(${label})` : platform === "ios" ? apple : google;
  return { native, apple, google, waze };
}
