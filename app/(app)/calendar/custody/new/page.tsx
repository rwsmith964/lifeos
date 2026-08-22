import { requireHouseholdContext } from "@/lib/auth/session";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { CustodyBlockForm } from "./custody-block-form";

export default async function NewCustodyBlockPage() {
  const { supabase, household } = await requireHouseholdContext();
  const people = await listPeopleForHousehold(supabase, household.id);

  const children = people.filter((p) => p.relationship_type === "child");
  const responsibleCandidates = people.filter((p) =>
    ["self", "co_parent", "parent", "spouse", "partner"].includes(p.relationship_type)
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Add custody block</h1>
      {children.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No children on record yet — add one under People first.
        </p>
      ) : (
        <CustodyBlockForm childPeople={children} responsibleCandidates={responsibleCandidates} />
      )}
    </div>
  );
}
