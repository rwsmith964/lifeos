import { requireHouseholdContext } from "@/lib/auth/session";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { filterEligibleResponsibleAdults } from "@/lib/custody/eligible-parents";
import { Breadcrumb } from "@/components/nav/breadcrumb";
import { NewScheduleForm } from "./new-schedule-form";

export default async function NewCustodyScheduleTypePage() {
  const { supabase, household } = await requireHouseholdContext();
  const people = await listPeopleForHousehold(supabase, household.id);

  const children = people.filter((p) => p.relationship_type === "child");
  const responsibleCandidates = filterEligibleResponsibleAdults(people);

  return (
    <div className="flex flex-col gap-4 p-4">
      <Breadcrumb
        items={[
          { label: "Calendar", href: "/calendar" },
          { label: "Custody", href: "/calendar/custody" },
          { label: "New schedule" },
        ]}
      />
      <h1 className="text-xl font-semibold">New recurring custody schedule</h1>
      <p className="text-sm text-muted-foreground">
        Pick a common pattern, or build a custom cycle. This generates real calendar blocks for the next 90 days and
        keeps generating as time passes.
      </p>
      {children.length === 0 ? (
        <p className="text-sm text-muted-foreground">No children on record yet — add one under People first.</p>
      ) : responsibleCandidates.length < 2 ? (
        <p className="text-sm text-muted-foreground">
          You need at least two eligible adults (co-parent, spouse, or partner) on record before building a recurring
          schedule.
        </p>
      ) : (
        <NewScheduleForm childPeople={children} responsibleCandidates={responsibleCandidates} />
      )}
    </div>
  );
}
