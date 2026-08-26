import { requireHouseholdContext } from "@/lib/auth/session";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { filterEligibleResponsibleAdults } from "@/lib/custody/eligible-parents";
import { CustodyBlockForm } from "./custody-block-form";

export default async function NewCustodyBlockPage() {
  const { supabase, household } = await requireHouseholdContext();
  const people = await listPeopleForHousehold(supabase, household.id);

  const children = people.filter((p) => p.relationship_type === "child");
  const responsibleCandidates = filterEligibleResponsibleAdults(people);

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Add a one-off custody block</h1>
      <p className="text-sm text-muted-foreground">
        For a single exception — a holiday swap, a one-time change. For a repeating pattern, use{" "}
        a recurring schedule instead.
      </p>
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
