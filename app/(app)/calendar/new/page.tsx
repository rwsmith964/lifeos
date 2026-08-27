import { requireHouseholdContext } from "@/lib/auth/session";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { EventForm } from "../event-form";

export default async function NewCalendarEventPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { supabase, household } = await requireHouseholdContext();
  const people = await listPeopleForHousehold(supabase, household.id);
  const { date } = await searchParams;

  // The calendar day view links here as `/calendar/new?date=YYYY-MM-DD`
  // for whichever day is selected — previously ignored entirely, so
  // clicking "Add" for e.g. next Tuesday landed on a form with no date
  // prefilled at all (Phase 3 backlog: "empty calendar days ... no
  // post-create redirect", same underlying gap).
  const isValidDate = !!date && /^\d{4}-\d{2}-\d{2}$/.test(date);

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Add event</h1>
      <EventForm
        people={people}
        endpoint="/api/calendar/events"
        defaults={isValidDate ? { date } : undefined}
        redirectTo={(savedDate) =>
          savedDate ? `/calendar?month=${savedDate.slice(0, 7)}&day=${savedDate}#selected-day` : "/calendar"
        }
        submitLabel="Save event"
        pendingLabel="Saving…"
      />
    </div>
  );
}
