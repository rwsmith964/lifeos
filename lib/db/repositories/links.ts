import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type {
  HouseholdLinkInviteInsert,
  HouseholdLinkInviteRow,
  HouseholdLinkInviteUpdate,
  HouseholdLinkShareRow,
  LinkShareCategory,
} from "../database.types";

export const householdLinkInvitesRepo = createRepository<
  HouseholdLinkInviteRow,
  HouseholdLinkInviteInsert,
  HouseholdLinkInviteUpdate
>("household_link_invites");

export async function listPendingLinkInvites(client: SupabaseClient, householdId: string): Promise<HouseholdLinkInviteRow[]> {
  return householdLinkInvitesRepo.list(client, (q) =>
    q.eq("from_household_id", householdId).eq("status", "pending").order("created_at", { ascending: false })
  );
}

/** One account holder in a household linked to ours. */
export interface LinkedAccount {
  linkId: string;
  otherHouseholdId: string;
  otherHouseholdName: string;
  userId: string;
  userDisplayName: string;
}

export async function listLinkedAccounts(client: SupabaseClient, householdId: string): Promise<LinkedAccount[]> {
  const { data, error } = await client.rpc("list_linked_accounts", { p_household: householdId });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, string>>).map((r) => ({
    linkId: r.link_id,
    otherHouseholdId: r.other_household_id,
    otherHouseholdName: r.other_household_name,
    userId: r.user_id,
    userDisplayName: r.user_display_name,
  }));
}

export async function listSharesForLinks(client: SupabaseClient, linkIds: string[]): Promise<HouseholdLinkShareRow[]> {
  if (linkIds.length === 0) return [];
  const { data, error } = await client.from("household_link_shares").select("*").in("link_id", linkIds);
  if (error) throw error;
  return (data ?? []) as HouseholdLinkShareRow[];
}

export async function setLinkShare(
  client: SupabaseClient,
  params: { linkId: string; sharingHouseholdId: string; category: LinkShareCategory; enabled: boolean }
): Promise<void> {
  const { error } = await client.from("household_link_shares").upsert(
    {
      link_id: params.linkId,
      sharing_household_id: params.sharingHouseholdId,
      category: params.category,
      enabled: params.enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "link_id,sharing_household_id,category" }
  );
  if (error) throw error;
}
