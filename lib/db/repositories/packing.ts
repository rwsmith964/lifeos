// D-139 (packing_checklist_v2) -- repository layer for the two tables added
// by supabase/migrations/20260902000006_packing_lists.sql. Every function
// here is additive: nothing existing calls this file, so it has zero effect
// on current behavior until a flagged caller (app/(app)/packing/*) uses it.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type {
  PackingListInsert,
  PackingListItemInsert,
  PackingListItemRow,
  PackingListItemUpdate,
  PackingListRow,
  PackingListUpdate,
} from "../database.types";

export const packingListsRepo = createRepository<PackingListRow, PackingListInsert, PackingListUpdate>(
  "packing_lists"
);

export const packingListItemsRepo = createRepository<
  PackingListItemRow,
  PackingListItemInsert,
  PackingListItemUpdate
>("packing_list_items");

/** Every packing list for a household, active first then archived, most recently created first within each group -- for the /packing index. */
export async function listPackingListsForHousehold(
  client: SupabaseClient,
  householdId: string
): Promise<PackingListRow[]> {
  return packingListsRepo.list(client, (q) =>
    q
      .eq("household_id", householdId)
      .order("status", { ascending: true }) // 'active' < 'archived' alphabetically -- active first
      .order("created_at", { ascending: false })
  );
}

/** Items for one packing list, unchecked first then checked, each group in sort_order -- so a long list doesn't bury what's still left to pack underneath everything already checked off. */
export async function listItemsForPackingList(
  client: SupabaseClient,
  packingListId: string
): Promise<PackingListItemRow[]> {
  return packingListItemsRepo.list(client, (q) =>
    q.eq("packing_list_id", packingListId).order("checked", { ascending: true }).order("sort_order", { ascending: true })
  );
}
