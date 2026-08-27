import { requireHouseholdContext } from "@/lib/auth/session";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { ActivityForm } from "../activity-form";

export default async function NewActivityPage() {
  const { supabase, household } = await requireHouseholdContext();
  const people = await listPeopleForHousehold(supabase, household.id);
  const possibleCompanions = people.filter((p) => p.relationship_type !== "self");

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Add an activity</h1>
      <ActivityForm
        possibleCompanions={possibleCompanions}
        endpoint="/api/activities"
        redirectTo="/activities"
        submitLabel="Save activity"
        pendingLabel="Saving…"
      />
    </div>
  );
}
