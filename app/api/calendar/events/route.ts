// POST /api/calendar/events — create a calendar event (+ attendees). A
// Route Handler rather than a Server Action; see
// lib/hooks/use-form-post.ts and DECISIONS.md D-031.
import { NextResponse } from "next/server";
import { requireHouseholdContext } from "@/lib/auth/session";
import { calendarEventsRepo, eventAttendeesRepo } from "@/lib/db/repositories/calendar";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { collectAttendeeNotes, parseItinerary } from "@/lib/events/invite-plan";
import { createInvitationsForEvent } from "@/lib/events/invitations";
import { getSiteOrigin } from "@/lib/http/site-origin";
import { calendarEventInsertSchema } from "@/lib/db/schemas";
import { coordinatesForLocation } from "@/lib/calendar/geocode-event";

export async function POST(request: Request) {
  const { supabase, household, selfPerson } = await requireHouseholdContext();
  const formData = await request.formData();
  const householdPeople = await listPeopleForHousehold(supabase, household.id);
  const hostRaw = String(formData.get("hostPersonId") ?? "");
  const hostPersonId = householdPeople.some((p) => p.id === hostRaw) ? hostRaw : null;

  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("startTime") ?? "09:00");
  const endTime = String(formData.get("endTime") ?? "10:00");
  const allDay = formData.get("allDay") === "on";
  const location = String(formData.get("location") ?? "").trim() || null;
  const prepRaw = Number.parseInt(String(formData.get("prepMinutes") ?? ""), 10);
  const coords = await coordinatesForLocation(location);

  const startsAt = allDay ? `${date}T00:00:00` : `${date}T${startTime}:00`;
  const endsAt = allDay ? `${date}T23:59:59` : `${date}T${endTime}:00`;

  const parsed = calendarEventInsertSchema.safeParse({
    household_id: household.id,
    created_by_person_id: selfPerson.id,
    title: String(formData.get("title") ?? "").trim(),
    starts_at: new Date(startsAt).toISOString(),
    ends_at: new Date(endsAt).toISOString(),
    all_day: allDay,
    location,
    itinerary: parseItinerary(String(formData.get("itinerary") ?? "")),
    host_person_id: hostPersonId,
    location_lat: coords?.lat ?? null,
    location_lng: coords?.lng ?? null,
    prep_time_before_minutes: Number.isFinite(prepRaw) && prepRaw > 0 ? prepRaw : null,
    event_type: String(formData.get("eventType") ?? "personal"),
    visibility: String(formData.get("visibility") ?? "private"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  try {
    const event = await calendarEventsRepo.create(supabase, parsed.data);

    const attendeeIds = formData
      .getAll("attendeePersonIds")
      .map(String)
      .filter((id) => householdPeople.some((p) => p.id === id));
    const notes = collectAttendeeNotes(formData.entries());
    await Promise.all(
      attendeeIds.map((personId) =>
        eventAttendeesRepo.create(supabase, {
          calendar_event_id: event.id,
          person_id: personId,
          personal_notes: notes.get(personId) ?? "",
        })
      )
    );

    let invited: string[] = [];
    let missingContact: string[] = [];
    if (formData.get("sendInvites") === "on" && attendeeIds.length > 0) {
      const outcome = await createInvitationsForEvent(supabase, {
        householdId: household.id,
        hostName: selfPerson.nickname || selfPerson.full_name,
        event,
        attendees: attendeeIds.map((id) => ({
          person: householdPeople.find((p) => p.id === id)!,
          note: notes.get(id) ?? "",
        })),
        origin: await getSiteOrigin(),
      });
      invited = outcome.invited;
      missingContact = outcome.missingContact;
    }

    return NextResponse.json({ id: event.id, invited, missingContact });
  } catch (error) {
    console.error("POST /api/calendar/events failed:", error);
    return NextResponse.json({ error: "Couldn't save this event — please try again." }, { status: 500 });
  }
}
