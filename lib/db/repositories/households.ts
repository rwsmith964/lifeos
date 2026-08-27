import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type {
  HouseholdInsert,
  HouseholdInviteInsert,
  HouseholdInvitePreview,
  HouseholdInviteRow,
  HouseholdInviteUpdate,
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

export const householdInvitesRepo = createRepository<
  HouseholdInviteRow,
  HouseholdInviteInsert,
  HouseholdInviteUpdate
>("household_invites");

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

/**
 * Pending + past invites for a household's Settings > Household members
 * list. Ordered newest-first so a freshly-sent invite appears at the top.
 */
export async function listInvitesForHousehold(
  client: SupabaseClient,
  householdId: string
): Promise<HouseholdInviteRow[]> {
  const { data, error } = await client
    .from("household_invites")
    .select("*")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as HouseholdInviteRow[];
}

/**
 * Pre-auth invite-landing-page lookup by token — calls the SECURITY
 * DEFINER `get_household_invite_preview` RPC (migration
 * 20260827000001_household_invites.sql) rather than selecting from
 * household_invites directly, since a logged-out or not-yet-a-member
 * visitor can never pass that table's own "members can read" RLS policy.
 * Returns null for an unknown token instead of throwing, so the page can
 * render a plain "invite not found" state.
 */
export async function getHouseholdInvitePreview(
  client: SupabaseClient,
  token: string
): Promise<HouseholdInvitePreview | null> {
  const { data, error } = await client
    .rpc("get_household_invite_preview", { p_token: token })
    .maybeSingle();
  if (error) throw error;
  return (data as HouseholdInvitePreview | null) ?? null;
}

/**
 * Accepts an invite as the CALLING (already-authenticated) user by calling
 * the SECURITY DEFINER `accept_household_invite` RPC — see that function's
 * comment in the migration for why a direct household_members insert
 * can't do this (the invitee isn't a member of the target household yet,
 * so no ordinary RLS-checked insert policy can let them add themselves).
 * The RPC itself re-validates the invite's status/expiry/email match
 * server-side, so this is safe to call with only a token.
 */
export async function acceptHouseholdInvite(
  client: SupabaseClient,
  token: string
): Promise<HouseholdMemberRow> {
  const { data, error } = await client.rpc("accept_household_invite", { p_token: token }).single();
  if (error) throw error;
  return data as HouseholdMemberRow;
}

/**
 * Emails for a household's current members, keyed by user_id. The public
 * `users` table has no email column (it lives only on Supabase's own
 * auth.users, which PostgREST doesn't expose directly) — calls the
 * `household_member_emails` SECURITY DEFINER RPC instead, which is scoped
 * to require the CALLING user already be a member of `householdId` before
 * returning anything (see that function's comment in
 * 20260827000001_household_invites.sql). Used only by the invite form's
 * "already a member" duplicate check.
 */
export async function listHouseholdMemberEmails(
  client: SupabaseClient,
  householdId: string
): Promise<Map<string, string>> {
  const { data, error } = await client.rpc("household_member_emails", { p_household_id: householdId });
  if (error) throw error;
  const rows = (data ?? []) as { user_id: string; email: string }[];
  return new Map(rows.map((r) => [r.user_id, r.email]));
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
