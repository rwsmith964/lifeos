// GET /api/reminders/departures -- the drives coming up in the next day and a
// half (drive blocks on the calendar, with a destination we can navigate to).
// The phone app turns these into local "leave in 15 minutes" / "time to go"
// notifications; see components/native/departure-reminders.tsx.
import { NextResponse } from "next/server";
import { addHours, format } from "date-fns";
import { requireHouseholdContext } from "@/lib/auth/session";
import { getZonedNow } from "@/lib/timezones";
import { listEventsInRange } from "@/lib/db/repositories/calendar";
import { floatingIso } from "@/lib/custody/materialize";
import { REMINDER_HORIZON_HOURS, type DepartureEvent } from "@/lib/reminders/departures";

const LOCAL = "yyyy-MM-dd'T'HH:mm:ss";

function destinationFrom(title: string, location: string | null): string {
  const m = /^(?:Drive to|Leave for)\s+(.+)$/i.exec(title.trim());
  return m ? m[1] : (location ?? title);
}

export async function GET() {
  const { supabase, household, selfPerson, timezone } = await requireHouseholdContext();
  const now = getZonedNow(timezone);
  const until = addHours(now, REMINDER_HORIZON_HOURS);

  const events = await listEventsInRange(
    supabase,
    household.id,
    floatingIso(format(now, LOCAL)),
    floatingIso(format(until, LOCAL))
  );

  const departures: DepartureEvent[] = events
    .filter(
      (e) =>
        e.event_type === "travel" &&
        !e.all_day &&
        e.location_lat != null &&
        e.location_lng != null &&
        e.created_by_person_id === selfPerson.id
    )
    .map((e) => ({
      id: e.id,
      startLocal: e.starts_at.slice(0, 19),
      title: e.title,
      destinationName: destinationFrom(e.title, e.location),
      lat: e.location_lat as number,
      lng: e.location_lng as number,
    }));

  return NextResponse.json({ departures });
}
