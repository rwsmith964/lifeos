import { notFound } from "next/navigation";
import { requireHouseholdContext } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/flags";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { PackingListForm } from "../packing-list-form";

export const metadata = {
  title: "New packing list — LifeOS",
};

export default async function NewPackingListPage() {
  const { supabase, household } = await requireHouseholdContext();

  const enabled = await isFeatureEnabled(supabase, household.id, "packing_checklist_v2");
  if (!enabled) {
    notFound();
  }

  const people = await listPeopleForHousehold(supabase, household.id);

  return (
    <div className="flex max-w-lg flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">New packing list</h1>
      <p className="text-xs text-muted-foreground">
        A few quick questions, then we&apos;ll generate a tailored checklist for the trip.
      </p>
      <PackingListForm travelers={people} />
    </div>
  );
}
