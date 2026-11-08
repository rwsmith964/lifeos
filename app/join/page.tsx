import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/client-server";
import { listHouseholdMembershipsForUser } from "@/lib/db/repositories/households";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { APP_NAME } from "@/lib/constants";
import { JoinForm } from "./join-form";

export const metadata = {
  title: "Join your household",
};

// Reached after accepting a household invite: the household already has a
// People list, so the new member says which of those people they are (or
// adds themselves) instead of starting a second household.
export default async function JoinPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const memberships = await listHouseholdMembershipsForUser(supabase, user.id);
  if (memberships.length === 0) redirect("/onboarding");

  const { data: userRow } = await supabase.from("users").select("active_household_id").eq("id", user.id).single();
  const activeId = userRow?.active_household_id as string | null | undefined;
  const target = memberships.find((m) => m.household.id === activeId) ?? memberships[0];

  const people = await listPeopleForHousehold(supabase, target.household.id, { includeArchived: false });
  if (people.some((p) => p.user_id === user.id)) redirect("/");

  const claimable = people
    .filter((p) => !p.user_id && p.relationship_type !== "self" && p.relationship_type !== "child")
    .map((p) => ({ id: p.id, name: p.full_name, detail: p.relationship_label || p.relationship_type.replace(/_/g, " ") }));

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Welcome to {target.household.name}</h1>
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        You&apos;re in {APP_NAME}. Which of these people are you? If you&apos;re not listed, add yourself.
      </p>
      <JoinForm householdId={target.household.id} people={claimable} defaultName={user.user_metadata?.display_name ?? ""} />
    </div>
  );
}
