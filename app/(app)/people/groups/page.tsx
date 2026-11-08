import { requireHouseholdContext } from "@/lib/auth/session";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { listGroupsForHousehold } from "@/lib/db/repositories/groups";
import { personDisplayName } from "@/lib/people/display-name";
import { Breadcrumb } from "@/components/nav/breadcrumb";
import { GroupsClient } from "./groups-client";

export const metadata = {
  title: "Groups — LifeOS",
};

export default async function GroupsPage() {
  const { supabase, household, selfPerson } = await requireHouseholdContext();
  const [people, groups] = await Promise.all([
    listPeopleForHousehold(supabase, household.id),
    listGroupsForHousehold(supabase, household.id).catch(() => []),
  ]);
  const active = people.filter((p) => !p.is_archived && p.id !== selfPerson.id);
  const nameById = new Map(people.map((p) => [p.id, personDisplayName(p)]));

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb items={[{ label: "People", href: "/people" }, { label: "Groups" }]} />
      <div>
        <h1 className="font-display text-xl font-semibold">Groups</h1>
        <p className="font-sans text-body text-ink-2">
          Save sets of people (&ldquo;Thanksgiving crowd&rdquo;, &ldquo;Fishing buddies&rdquo;) so you can invite them to an event in one tap.
        </p>
      </div>
      <GroupsClient
        people={active.map((p) => ({ id: p.id, name: personDisplayName(p) }))}
        groups={groups.map((g) => ({
          id: g.id,
          name: g.name,
          members: g.member_person_ids.map((id) => nameById.get(id)).filter((n): n is string => !!n),
        }))}
      />
    </div>
  );
}
