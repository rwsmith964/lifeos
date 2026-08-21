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

export async function getShippingWindows(client: SupabaseClient): Promise<GiftShippingWindowRow[]> {
  const { data, error } = await client.from("gift_shipping_windows").select("*");
  if (error) throw error;
  return (data ?? []) as GiftShippingWindowRow[];
}
