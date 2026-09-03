"use server";

// D-139 (packing_checklist_v2, roadmap R-2). Every write goes through the
// request-scoped, RLS-enforced client from requireHouseholdContext() and
// through lib/db/repositories/packing.ts -- never a raw insert (Additive
// Contract §3). These pair with useAsyncToastAction on the client (throw on
// failure, not a SimpleFormState) -- same shape as
// app/(app)/settings/feature-flags-actions.ts and
// app/(app)/gifts/actions.ts's status-toggle actions -- because none of
// these need a page navigation, only a pending state + toast + refresh.
import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/flags";
import { friendlyMutationError } from "@/lib/db/errors";
import {
  packingListItemsRepo,
  packingListsRepo,
  listItemsForPackingList,
} from "@/lib/db/repositories/packing";
import { packingListItemInsertSchema } from "@/lib/db/schemas";
import { generatePackingChecklist, type GeneratePackingChecklistResult } from "@/lib/packing/generate";

async function requirePackingEnabled() {
  const ctx = await requireHouseholdContext();
  const enabled = await isFeatureEnabled(ctx.supabase, ctx.household.id, "packing_checklist_v2");
  if (!enabled) {
    throw new Error("The packing checklist wizard isn't turned on for this household.");
  }
  return ctx;
}

function revalidatePackingPaths(packingListId?: string) {
  revalidatePath("/packing");
  if (packingListId) revalidatePath(`/packing/${packingListId}`);
}

/**
 * Mirrors generateSuggestionsAction's discriminated result -- ai_unavailable
 * / budget_exceeded / parse_failed are all real, expected outcomes (missing
 * key, daily spend cap, a malformed model response), not exceptions, so the
 * caller decides what to show rather than this action throwing for them.
 */
export async function generateChecklistAction(packingListId: string): Promise<GeneratePackingChecklistResult> {
  const { supabase } = await requirePackingEnabled();
  const packingList = await packingListsRepo.getById(supabase, packingListId);
  if (!packingList) {
    return { status: "parse_failed", reason: "This packing list no longer exists." };
  }
  const result = await generatePackingChecklist(supabase, packingList);
  if (result.status === "generated") {
    revalidatePackingPaths(packingListId);
  }
  return result;
}

export async function toggleItemCheckedAction(itemId: string, checked: boolean): Promise<void> {
  const { supabase } = await requirePackingEnabled();
  await packingListItemsRepo.update(supabase, itemId, { checked });
  revalidatePackingPaths();
}

export async function addManualItemAction(packingListId: string, label: string, category?: string): Promise<void> {
  const { supabase, household } = await requirePackingEnabled();
  const existing = await listItemsForPackingList(supabase, packingListId);
  const nextSortOrder = existing.length > 0 ? Math.max(...existing.map((i) => i.sort_order)) + 1 : 0;

  const parsed = packingListItemInsertSchema.safeParse({
    household_id: household.id,
    packing_list_id: packingListId,
    label,
    category: category?.trim() || null,
    source: "manual",
    sort_order: nextSortOrder,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Couldn't add that item.");
  }

  try {
    await packingListItemsRepo.create(supabase, parsed.data);
  } catch (error) {
    throw new Error(friendlyMutationError(error, { fallback: "Couldn't add that item — please try again." }));
  }
  revalidatePackingPaths();
}

export async function removeItemAction(itemId: string): Promise<void> {
  const { supabase } = await requirePackingEnabled();
  await packingListItemsRepo.remove(supabase, itemId);
  revalidatePackingPaths();
}

export async function archivePackingListAction(packingListId: string): Promise<void> {
  const { supabase } = await requirePackingEnabled();
  await packingListsRepo.update(supabase, packingListId, { status: "archived" });
  revalidatePackingPaths(packingListId);
}

export async function reactivatePackingListAction(packingListId: string): Promise<void> {
  const { supabase } = await requirePackingEnabled();
  await packingListsRepo.update(supabase, packingListId, { status: "active" });
  revalidatePackingPaths(packingListId);
}

export async function deletePackingListAction(packingListId: string): Promise<void> {
  const { supabase } = await requirePackingEnabled();
  await packingListsRepo.remove(supabase, packingListId);
  revalidatePath("/packing");
}
