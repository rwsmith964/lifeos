// Route protection lives here, not in proxy.ts (see proxy.ts's comment on
// why) — every (app) page/layout calls this to get an authenticated
// Supabase client plus the current household/self-person, or gets
// redirected. Centralizing it means the redirect rules (no session ->
// /login, no household yet -> /onboarding) are defined exactly once.
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../db/client-server";
import { listHouseholdsForUser } from "../db/repositories/households";
import { listPeopleForHousehold } from "../db/repositories/people";
import type { HouseholdRow, PersonRow } from "../db/database.types";

export interface HouseholdContext {
  supabase: SupabaseClient;
  userId: string;
  household: HouseholdRow;
  selfPerson: PersonRow;
}

export async function requireHouseholdContext(): Promise<HouseholdContext> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const households = await listHouseholdsForUser(supabase, user.id);
  const household = households[0];
  if (!household) redirect("/onboarding");

  const people = await listPeopleForHousehold(supabase, household.id, { includeArchived: true });
  const selfPerson = people.find((p) => p.user_id === user.id && p.relationship_type === "self");
  if (!selfPerson) redirect("/onboarding");

  return { supabase, userId: user.id, household, selfPerson };
}
