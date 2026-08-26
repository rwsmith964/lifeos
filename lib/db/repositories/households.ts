import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type {
  HouseholdInsert,
  HouseholdLinkInsert,
  HouseholdLinkRow,
  HouseholdLinkUpdate,
  HouseholdMemberInsert,
  HouseholdMemberRow,
  HouseholdMemberUpdate,
  HouseholdRow,
  HouseholdUpdate,
  UserInsert,
  UserRow,
  UserUpdate,
} from "../database.types";

export const householdsRepo = createRepository<HouseholdRow, HouseholdInsert, HouseholdUpdate>(
  "households"
);

export const usersRepo = createRepository<UserRow, UserInsert, UserUpdate>("users");

export const householdMembersRepo = createRepository<
  HouseholdMemberRow,
  HouseholdMemberInsert,
  HouseholdMemberUpdate
>("household_members");

export const householdLinksRepo = createRepository<
  HouseholdLinkRow,
  HouseholdLinkInsert,
  HouseholdLinkUpdate
>("household_links");

export async function listMembersOfHousehold(
  client: SupabaseClient,
  householdId: string
): Promise<HouseholdMemberRow[]> {
  return householdMembersRepo.list(client, (q) => q.eq("household_id", householdId));
}

export async function listHouseholdsForUser(
  client: SupabaseClient,
  userId: string
): Promise<HouseholdRow[]> {
  const { data, error } = await client
    .from("household_members")
    .select("household:households(*)")
    .eq("user_id", userId);
  if (error) throw error;
  return ((data ?? []) as unknown as { household: HouseholdRow }[]).map((row) => row.household);
}

/**
 * Onboarding: create a household and self-join as its owner in one call.
 *
 * This calls a SECURITY DEFINER database function (see migration
 * 20260826000001_fix_household_bootstrap_returning.sql) rather than doing
 * the two inserts directly from the client. Doing them as two separate
 * client-side inserts hits a real RLS chicken-and-egg problem: inserting a
 * household with `.select()` (i.e. `RETURNING`) requires the household's
 * SELECT policy (`is_household_member`) to pass, but the current user isn't
 * a member yet -- that's the very next statement -- so the insert always
 * failed with "new row violates row-level security policy for table
 * households" even though the INSERT policy itself was fine. The database
 * function does both inserts atomically as its (table-owning) definer,
 * which legitimately bypasses RLS the same way the other helper functions
 * in this schema do, and only ever adds the calling `auth.uid()` as owner.
 */
export async function createHouseholdWithOwner(
  client: SupabaseClient,
  _userId: string,
  name: string
): Promise<HouseholdRow> {
  const { data, error } = await client
    .rpc("create_household_with_owner", { household_name: name })
    .single();
  if (error) throw error;
  return data as HouseholdRow;
}

export async function listActiveLinksForHousehold(
  client: SupabaseClient,
  householdId: string
): Promise<HouseholdLinkRow[]> {
  const { data, error } = await client
    .from("household_links")
    .select("*")
    .eq("status", "active")
    .or(`household_a_id.eq.${householdId},household_b_id.eq.${householdId}`);
  if (error) throw error;
  return (data ?? []) as HouseholdLinkRow[];
}
