import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type { TodayItemDismissalInsert, TodayItemDismissalRow } from "../database.types";

// B2 (audit pass 2026-09-11): backs Dismiss/Snooze on Today's priority
// cards. See supabase/migrations/20260911000001_today_item_dismissals.sql
// -- this table needs that migration applied before any of these calls can
// succeed; every caller here is expected to handle the "table does not
// exist yet" case gracefully until then (see today-item-actions.ts).
export const todayItemDismissalsRepo = createRepository<
  TodayItemDismissalRow,
  TodayItemDismissalInsert,
  never
>("today_item_dismissals");

/** Every item currently hidden for this viewer, keyed by item_key, dropping any whose hidden_until has already passed. */
export async function listActiveDismissalsForPerson(
  client: SupabaseClient,
  personId: string,
  todayDateStr: string
): Promise<Set<string>> {
  const { data, error } = await client
    .from("today_item_dismissals")
    .select("item_key")
    .eq("person_id", personId)
    .gte("hidden_until", todayDateStr);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.item_key as string));
}

export async function setItemDismissal(
  client: SupabaseClient,
  params: { householdId: string; personId: string; itemKey: string; hiddenUntil: string }
): Promise<void> {
  await todayItemDismissalsRepo.upsert(
    client,
    {
      household_id: params.householdId,
      person_id: params.personId,
      item_key: params.itemKey,
      hidden_until: params.hiddenUntil,
    },
    "person_id,item_key"
  );
}
