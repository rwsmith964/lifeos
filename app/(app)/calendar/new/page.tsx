import Link from "next/link";
import { requireHouseholdContext } from "@/lib/auth/session";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { Breadcrumb } from "@/components/nav/breadcrumb";
import { EventForm } from "../event-form";
import { listGroupsForHousehold } from "@/lib/db/repositories/groups";

export default async function NewCalendarEventPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; start?: string; end?: string; title?: string; with?: string }>;
}) {
  const { supabase, household } = await requireHouseholdContext();
  // excludeSelf: true matches the People tab (P0-5) -- you're always
  // implicitly on your own calendar, so you're not a selectable attendee
  // of your own event.
  const people = await listPeopleForHousehold(supabase, household.id, { excludeSelf: true });
  const groups = await listGroupsForHousehold(supabase, household.id).catch(() => []);
  const { date, start, end, title, with: withId } = await searchParams;

  // The calendar day view links here as `/calendar/new?date=YYYY-MM-DD`
  // for whichever day is selected — previously ignored entirely, so
  // clicking "Add" for e.g. next Tuesday landed on a form with no date
  // prefilled at all (Phase 3 backlog: "empty calendar days ... no
  // post-create redirect", same underlying gap).
  const isValidDate = !!date && /^\d{4}-\d{2}-\d{2}$/.test(date);

  return (
    <div className="flex flex-col gap-4 p-4">
      <Breadcrumb items={[{ label: "Calendar", href: "/calendar" }, { label: "Add event" }]} />
      <h1 className="text-xl font-semibold">Add event</h1>
      <p className="text-sm text-muted-foreground">
        Have an invitation?{" "}
        <Link href="/calendar/invite" className="underline underline-offset-2">
          Add it from a photo
        </Link>{" "}
        instead.
      </p>
      <EventForm
        people={people}
        groups={groups}
        endpoint="/api/calendar/events"
        defaults={
          isValidDate
            ? {
                date,
                // Prefilled by "Find a time": the suggested slot, a title, and who to invite.
                ...(start && /^d{2}:d{2}$/.test(start) ? { startTime: start } : {}),
                ...(end && /^d{2}:d{2}$/.test(end) ? { endTime: end } : {}),
                ...(title ? { title: title.slice(0, 200) } : {}),
                ...(withId && people.some((p) => p.id === withId) ? { attendeePersonIds: [withId] } : {}),
              }
            : undefined
        }
        submitLabel="Save event"
        pendingLabel="Saving…"
      />
    </div>
  );
}
