import { requireHouseholdContext } from "@/lib/auth/session";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { TripIdeaForm } from "../../trip-idea-form";

export default async function NewTripIdeaPage() {
  const { supabase, household } = await requireHouseholdContext();
  const people = await listPeopleForHousehold(supabase, household.id);
  const possibleCompanions = people.filter((p) => p.relationship_type !== "self");

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Add a trip idea</h1>
      <p className="text-xs text-muted-foreground">
        For the someday/bucket-list bigger trips — not routine outings. Add one whenever a &ldquo;we should do this
        someday&rdquo; idea comes up.
      </p>
      <TripIdeaForm
        possibleCompanions={possibleCompanions}
        endpoint="/api/trip-ideas"
        redirectTo="/activities"
        submitLabel="Save trip idea"
        pendingLabel="Saving…"
      />
    </div>
  );
}
