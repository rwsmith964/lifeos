import { notFound } from "next/navigation";
import { requireHouseholdContext } from "@/lib/auth/session";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { custodyBlocksRepo } from "@/lib/db/repositories/calendar";
import { filterEligibleResponsibleAdults } from "@/lib/custody/eligible-parents";
import { CustodyBlockForm, type CustodyBlockFormDefaults } from "../../custody-block-form";

// D-097: edit page for a one-off custody block. Only reachable for
// custody_schedule_id === null blocks — a schedule-generated block 404s
// here and should be edited via a schedule exception instead (see
// app/api/calendar/custody/[id]/route.ts's header comment for why).
export default async function EditCustodyBlockPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, household } = await requireHouseholdContext();

  const block = await custodyBlocksRepo.getById(supabase, id);
  if (!block || block.household_id !== household.id) notFound();
  if (block.custody_schedule_id) notFound();

  const people = await listPeopleForHousehold(supabase, household.id);
  const children = people.filter((p) => p.relationship_type === "child");
  const responsibleCandidates = filterEligibleResponsibleAdults(people);

  const toDateStr = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const toTimeStr = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const defaults: CustodyBlockFormDefaults = {
    childPersonId: block.child_person_id,
    responsiblePersonId: block.responsible_person_id,
    startDate: toDateStr(block.starts_at),
    endDate: toDateStr(block.ends_at),
    handoverTime: toTimeStr(block.starts_at),
    blockType: block.block_type,
    location: block.location ?? "",
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Edit custody block</h1>
      <CustodyBlockForm
        childPeople={children}
        responsibleCandidates={responsibleCandidates}
        endpoint={`/api/calendar/custody/${id}`}
        method="PATCH"
        defaults={defaults}
        submitLabel="Save changes"
        pendingLabel="Saving…"
      />
    </div>
  );
}
