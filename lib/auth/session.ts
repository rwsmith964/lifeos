// Route protection lives here, not in proxy.ts (see proxy.ts's comment on
// why) — every (app) page/layout calls this to get an authenticated
// Supabase client plus the current household/self-person, or gets
// redirected. Centralizing it means the redirect rules (no session ->
// /login, no household yet -> /onboarding) are defined exactly once.
import { cache } from "react";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../db/client-server";
import {
  listHouseholdMembershipsForUser,
  type HouseholdMembership,
} from "../db/repositories/households";
import { listPeopleForHousehold } from "../db/repositories/people";
import type { HouseholdRow, PersonRow } from "../db/database.types";

export interface HouseholdContext {
  supabase: SupabaseClient;
  userId: string;
  household: HouseholdRow;
  selfPerson: PersonRow;
  // Every household this user belongs to, oldest membership first. Used
  // to render the Settings household switcher only when there's more
  // than one (D-055 household switching) — the common single-household
  // case gets a one-item list and no visible switcher.
  memberships: HouseholdMembership[];
}

// Memoized per request (React's cache(), not a cross-request cache — see
// https://react.dev/reference/react/cache): this function is called from
// both the (app) layout and every mutating Server Action nested under it,
// so dedupe to one real getUser() round trip per request instead of one
// per call site.
export const requireHouseholdContext = cache(async (): Promise<HouseholdContext> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const memberships = await listHouseholdMembershipsForUser(supabase, user.id);
  if (memberships.length === 0) redirect("/onboarding");

  // Prefer the user's explicitly active household (set at signup/onboarding,
  // switched via Settings, or auto-set to "whatever you just accepted an
  // invite into" — see accept_household_invite()) as long as it's still one
  // of their real memberships (e.g. not one they were since removed from).
  // Falls back to their oldest membership, which is exactly the previous
  // "households[0]" behavior for every user who has never had a second
  // household to choose between.
  const { data: userRow } = await supabase
    .from("users")
    .select("active_household_id")
    .eq("id", user.id)
    .single();
  const activeId = userRow?.active_household_id as string | null | undefined;
  const active = memberships.find((m) => m.household.id === activeId) ?? memberships[0];
  const household = active.household;

  const people = await listPeopleForHousehold(supabase, household.id, { includeArchived: true });
  const selfPerson = people.find((p) => p.user_id === user.id && p.relationship_type === "self");
  if (!selfPerson) redirect("/onboarding");

  return { supabase, userId: user.id, household, selfPerson, memberships };
});
