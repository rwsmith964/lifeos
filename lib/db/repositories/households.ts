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

/** Onboarding: create a household and self-join as its owner in one call. */
export async function createHouseholdWithOwner(
  client: SupabaseClient,
  userId: string,
  name: string
): Promise<HouseholdRow> {
  const household = await householdsRepo.create(client, { name });
  await householdMembersRepo.create(client, {
    household_id: household.id,
    user_id: userId,
    role: "owner",
  });
  return household;
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
