import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type {
  ChildcareRequestInsert,
  ChildcareRequestPreview,
  ChildcareRequestRow,
  ChildcareRequestUpdate,
} from "../database.types";

// D-060: childcare request/accept-decline flow. See the migration
// (20260828000002_childcare_providers_and_requests.sql) for why the
// respond/preview paths go through SECURITY DEFINER RPCs rather than
// ordinary RLS-checked reads/writes — the provider (e.g. "my mom") is
// very often not a LifeOS account holder and can't satisfy
// is_household_member().
export const childcareRequestsRepo = createRepository<
  ChildcareRequestRow,
  ChildcareRequestInsert,
  ChildcareRequestUpdate
>("childcare_requests");

export async function listChildcareRequestsForHousehold(
  client: SupabaseClient,
  householdId: string
): Promise<ChildcareRequestRow[]> {
  return childcareRequestsRepo.list(client, (q) =>
    q.eq("household_id", householdId).order("care_date", { ascending: true })
  );
}

export async function listChildcareRequestsForProvider(
  client: SupabaseClient,
  providerPersonId: string
): Promise<ChildcareRequestRow[]> {
  return childcareRequestsRepo.list(client, (q) =>
    q.eq("provider_person_id", providerPersonId).order("care_date", { ascending: true })
  );
}

/**
 * Public, unauthenticated preview for the emailed accept/decline link —
 * mirrors getHouseholdInvitePreview()'s "treat any lookup failure as not
 * found" handling for the same reason: p_token is a `uuid`-typed RPC arg,
 * so a syntactically invalid token in the URL fails the cast (22P02)
 * before the function body runs at all.
 */
export async function getChildcareRequestPreview(
  client: SupabaseClient,
  token: string
): Promise<ChildcareRequestPreview | null> {
  const { data, error } = await client
    .rpc("get_childcare_request_preview", { p_token: token })
    .maybeSingle();
  if (error) {
    if (error.code === "22P02") return null;
    throw error;
  }
  return (data as ChildcareRequestPreview | null) ?? null;
}

/**
 * Accept or decline by token alone — deliberately no auth check, see the
 * migration's respond_to_childcare_request() comment. The RPC itself
 * re-validates status/expiry server-side, so this is safe to call with
 * only a token from a public, logged-out page.
 */
export async function respondToChildcareRequest(
  client: SupabaseClient,
  token: string,
  response: "accepted" | "declined"
): Promise<ChildcareRequestRow> {
  const { data, error } = await client
    .rpc("respond_to_childcare_request", { p_token: token, p_response: response })
    .single();
  if (error) throw error;
  return data as ChildcareRequestRow;
}
