import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type {
  GiftInsert,
  GiftRow,
  GiftShippingWindowRow,
  GiftSuggestionInsert,
  GiftSuggestionRow,
  GiftSuggestionUpdate,
  GiftUpdate,
} from "../database.types";

export const giftsRepo = createRepository<GiftRow, GiftInsert, GiftUpdate>("gifts");

export const giftSuggestionsRepo = createRepository<
  GiftSuggestionRow,
  GiftSuggestionInsert,
  GiftSuggestionUpdate
>("gift_suggestions");

export async function listGiftsForPerson(
  client: SupabaseClient,
  personId: string,
  limit?: number
): Promise<GiftRow[]> {
  return giftsRepo.list(client, (q) => {
    let query = q.eq("person_id", personId).order("occasion_date", { ascending: false });
    if (limit) query = query.limit(limit);
    return query;
  });
}

export async function listSuggestionsForPerson(
  client: SupabaseClient,
  personId: string
): Promise<GiftSuggestionRow[]> {
  return giftSuggestionsRepo.list(client, (q) =>
    q.eq("person_id", personId).order("generated_at", { ascending: false })
  );
}

export async function listDismissedSuggestionTitles(
  client: SupabaseClient,
  personId: string
): Promise<string[]> {
  const rows = await giftSuggestionsRepo.list(client, (q) =>
    q.eq("person_id", personId).eq("status", "dismissed")
  );
  return rows.map((r) => r.title);
}

/**
 * Titles of suggestions currently visible to the user (suggested/saved) or
 * already fulfilled (converted_to_gift) for this person. Used at
 * generation time (P1-11) to hard-block a new AI suggestion that fuzzy-
 * duplicates one already active or already bought — distinct from
 * listDismissedSuggestionTitles, which only feeds the AI prompt as a soft
 * "don't repeat this" hint.
 */
export async function listActiveAndConvertedSuggestionTitlesForPerson(
  client: SupabaseClient,
  personId: string
): Promise<string[]> {
  const rows = await giftSuggestionsRepo.list(client, (q) =>
    q.eq("person_id", personId).in("status", ["suggested", "saved", "ordered", "converted_to_gift"])
  );
  return rows.map((r) => r.title);
}

export async function listSuggestionsDueForOrder(
  client: SupabaseClient,
  householdId: string,
  withinDays: number
): Promise<GiftSuggestionRow[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);
  const { data, error } = await client
    .from("gift_suggestions")
    .select("*, person:people!inner(household_id)")
    .eq("person.household_id", householdId)
    .in("status", ["suggested", "saved"])
    .lte("order_by_date", cutoff.toISOString().slice(0, 10));
  if (error) throw error;
  return (data ?? []) as GiftSuggestionRow[];
}

export async function listActiveSuggestionsForHousehold(
  client: SupabaseClient,
  householdId: string
): Promise<(GiftSuggestionRow & { person: { id: string; full_name: string } })[]> {
  const { data, error } = await client
    .from("gift_suggestions")
    .select("*, person:people!inner(id, full_name, household_id)")
    .eq("person.household_id", householdId)
    .in("status", ["suggested", "saved", "ordered"])
    // P1-11: order_by_date alone leaves ties (same date, or several rows
    // that share it) in whatever order Postgres happens to return them,
    // which is not guaranteed stable across requests. Chain deterministic
    // tiebreakers so the list order never shuffles on reload.
    .order("order_by_date", { ascending: true })
    .order("person_id", { ascending: true })
    .order("generated_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []) as (GiftSuggestionRow & { person: { id: string; full_name: string } })[];
}

export async function getShippingWindows(client: SupabaseClient): Promise<GiftShippingWindowRow[]> {
  const { data, error } = await client.from("gift_shipping_windows").select("*");
  if (error) throw error;
  return (data ?? []) as GiftShippingWindowRow[];
}
