import { requireHouseholdContext } from "@/lib/auth/session";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { Breadcrumb } from "@/components/nav/breadcrumb";
import { InviteFlow } from "./invite-flow";

export const metadata = {
  title: "Add from a photo — LifeOS",
};

export default async function InvitePhotoPage() {
  const { supabase, household, selfPerson } = await requireHouseholdContext();
  // Include yourself: invitations are often addressed to you, and "That's me"
  // is a valid answer to "who is this name?".
  const people = (await listPeopleForHousehold(supabase, household.id)).filter((p) => !p.is_archived);

  return (
    <div className="flex flex-col gap-4 p-4">
      <Breadcrumb items={[{ label: "Calendar", href: "/calendar" }, { label: "Add from a photo" }]} />
      <h1 className="text-xl font-semibold">Add from a photo</h1>
      <InviteFlow
        people={people.map((p) => ({
          id: p.id,
          full_name: p.full_name,
          nickname: p.nickname,
          relationship_type: p.relationship_type,
          relationship_label: p.relationship_label,
          isSelf: p.id === selfPerson.id,
        }))}
      />
    </div>
  );
}
