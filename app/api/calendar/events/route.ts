// POST /api/calendar/events — create a calendar event (+ attendees). A
// Route Handler rather than a Server Action; see
// lib/hooks/use-form-post.ts and DECISIONS.md D-031.
import { NextResponse } from "next/server";
import { requireHouseholdContext } from "@/lib/auth/session";
import { calendarEventsRepo, eventAttendeesRepo } from "@/lib/db/repositories/calendar";
import { calendarEventInsertSchema } from "@/lib/db/schemas";

export async function POST(request: Request) {
  const { supabase, household, selfPerson } = await requireHouseholdContext();
  const formData = await request.formData();

  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("startTime") ?? "09:00");
  const endTime = String(formData.get("endTime") ?? "10:00");
  const allDay = formData.get("allDay") === "on";

  const startsAt = allDay ? `${date}T00:00:00` : `${date}T${startTime}:00`;
  const endsAt = allDay ? `${date}T23:59:59` : `${date}T${endTime}:00`;

  const parsed = calendarEventInsertSchema.safeParse({
    household_id: household.id,
    created_by_person_id: selfPerson.id,
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
    const event = await calendarEventsRepo.create(supabase, parsed.data);

    const attendeeIds = formData.getAll("attendeePersonIds").map(String).filter(Boolean);
    await Promise.all(
      attendeeIds.map((personId) =>
        eventAttendeesRepo.create(supabase, { calendar_event_id: event.id, person_id: personId })
      )
    );

    return NextResponse.json({ id: event.id });
  } catch (error) {
    console.error("POST /api/calendar/events failed:", error);
    return NextResponse.json({ error: "Couldn't save this event — please try again." }, { status: 500 });
  }
}
