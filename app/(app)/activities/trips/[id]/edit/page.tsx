import { notFound } from "next/navigation";
import { requireHouseholdContext } from "@/lib/auth/session";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { tripIdeasRepo } from "@/lib/db/repositories/trip-ideas";
import { TripIdeaForm, type TripIdeaFormDefaults } from "../../../trip-idea-form";

export default async function EditTripIdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, household } = await requireHouseholdContext();

  const trip = await tripIdeasRepo.getById(supabase, id);
  if (!trip || trip.household_id !== household.id) notFound();

  const people = await listPeopleForHousehold(supabase, household.id);
  const possibleCompanions = people.filter((p) => p.relationship_type !== "self");

  const defaults: TripIdeaFormDefaults = {
    title: trip.title,
    activityType: trip.activity_type ?? "",
    description: trip.description ?? "",
    targetTimeframe: trip.target_timeframe ?? "",
    companionPersonIds: trip.companion_person_ids ?? [],
    status: trip.status,
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Edit trip idea</h1>
      <TripIdeaForm
        possibleCompanions={possibleCompanions}
        endpoint={`/api/trip-ideas/${id}`}
        method="PATCH"
        redirectTo="/activities"
        submitLabel="Save changes"
        pendingLabel="Saving…"
        defaults={defaults}
      />
    </div>
  );
}
