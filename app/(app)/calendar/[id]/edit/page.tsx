import { notFound } from "next/navigation";
import { requireHouseholdContext } from "@/lib/auth/session";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { calendarEventsRepo, listAttendeesForEvent } from "@/lib/db/repositories/calendar";
import { EventForm, type EventFormDefaults } from "../../event-form";

export default async function EditCalendarEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, household } = await requireHouseholdContext();

  const event = await calendarEventsRepo.getById(supabase, id);
  if (!event || event.household_id !== household.id) notFound();

  const [people, attendees] = await Promise.all([
    // excludeSelf: true matches the People tab and Add Event (P0-5).
    listPeopleForHousehold(supabase, household.id, { excludeSelf: true }),
    listAttendeesForEvent(supabase, id),
  ]);

  const startsAt = new Date(event.starts_at);
  const endsAt = new Date(event.ends_at);
  // Render in the values the form's own inputs expect (YYYY-MM-DD /
  // HH:mm), taken straight from the stored UTC instant's local wall-clock
  // components — same simple approach the create form already uses, no
  // extra timezone conversion library needed here.
  const toDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const toTimeStr = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  const defaults: EventFormDefaults = {
    title: event.title,
    date: toDateStr(startsAt),
    allDay: event.all_day ?? false,
    startTime: toTimeStr(startsAt),
    endTime: toTimeStr(endsAt),
    location: event.location ?? "",
    eventType: event.event_type ?? "personal",
    visibility: event.visibility ?? "private",
    attendeePersonIds: attendees.map((a) => a.person_id),
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Edit event</h1>
      <EventForm
        people={people}
        endpoint={`/api/calendar/events/${id}`}
        method="PATCH"
        defaults={defaults}
        submitLabel="Save changes"
        pendingLabel="Saving…"
      />
    </div>
  );
}
