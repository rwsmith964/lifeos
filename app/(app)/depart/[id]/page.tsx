import { notFound } from "next/navigation";
import { format } from "date-fns";
import { requireHouseholdContext } from "@/lib/auth/session";
import { calendarEventsRepo } from "@/lib/db/repositories/calendar";
import { NavigateButtons } from "./navigate-buttons";

export const metadata = {
  title: "Time to go — LifeOS",
};

// Opened from a departure reminder: one big Navigate button for the drive.
export default async function DepartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, household } = await requireHouseholdContext();
  const event = await calendarEventsRepo.getById(supabase, id).catch(() => null);
  if (!event || event.household_id !== household.id) notFound();

  const destination = /^(?:Drive to|Leave for)\s+(.+)$/i.exec(event.title.trim())?.[1] ?? event.location ?? event.title;
  const start = new Date(event.starts_at);
  const hasPoint = event.location_lat != null && event.location_lng != null;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 py-6">
      <div>
        <p className="font-sans text-metadata text-meta">Leave at {format(start, "h:mm a")}</p>
        <h1 className="font-display text-2xl font-semibold">{destination}</h1>
        {event.location && <p className="font-sans text-body text-ink-2">{event.location}</p>}
        {event.description && <p className="font-sans text-metadata text-meta">{event.description}</p>}
      </div>
      {hasPoint ? (
        <NavigateButtons lat={event.location_lat as number} lng={event.location_lng as number} label={destination} />
      ) : (
        <p className="font-sans text-body text-ink-2">There&apos;s no saved location for this drive, so I can&apos;t open directions.</p>
      )}
    </div>
  );
}
