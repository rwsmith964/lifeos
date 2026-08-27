// PATCH /api/calendar/events/[id] — edit an existing calendar event (+
// resync attendees). Mirrors POST /api/calendar/events; see that file's
// header comment for why this is a Route Handler rather than a Server
// Action (DECISIONS.md D-031). D-056: closes the "calendar events are
// add/delete only, no edit" gap from PROGRESS.md Phase 7.
import { NextResponse } from "next/server";
import { requireHouseholdContext } from "@/lib/auth/session";
import { calendarEventsRepo, eventAttendeesRepo, listAttendeesForEvent } from "@/lib/db/repositories/calendar";
import { calendarEventUpdateSchema } from "@/lib/db/schemas";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, household } = await requireHouseholdContext();

  const existing = await calendarEventsRepo.getById(supabase, id);
  if (!existing || existing.household_id !== household.id) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  const formData = await request.formData();
  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("startTime") ?? "09:00");
  const endTime = String(formData.get("endTime") ?? "10:00");
  const allDay = formData.get("allDay") === "on";

  const startsAt = allDay ? `${date}T00:00:00` : `${date}T${startTime}:00`;
  const endsAt = allDay ? `${date}T23:59:59` : `${date}T${endTime}:00`;

  const parsed = calendarEventUpdateSchema.safeParse({
    title: String(formData.get("title") ?? "").trim(),
    starts_at: new Date(startsAt).toISOString(),
    ends_at: new Date(endsAt).toISOString(),
    all_day: allDay,
    location: String(formData.get("location") ?? "").trim() || null,
    event_type: String(formData.get("eventType") ?? "personal"),
    visibility: String(formData.get("visibility") ?? "private"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  try {
    const event = await calendarEventsRepo.update(supabase, id, parsed.data);

    // Resync attendees: delete the old set, insert the new one. Simpler
    // and safer than diffing given attendee lists here are always small
    // (a handful of household members).
    const currentAttendees = await listAttendeesForEvent(supabase, id);
    await Promise.all(currentAttendees.map((a) => supabase.from("event_attendees").delete().eq("id", a.id)));

    const attendeeIds = formData.getAll("attendeePersonIds").map(String).filter(Boolean);
    await Promise.all(
      attendeeIds.map((personId) =>
        eventAttendeesRepo.create(supabase, { calendar_event_id: event.id, person_id: personId })
      )
    );

    return NextResponse.json({ id: event.id });
  } catch (error) {
    console.error(`PATCH /api/calendar/events/${id} failed:`, error);
    return NextResponse.json({ error: "Couldn't save changes — please try again." }, { status: 500 });
  }
}
