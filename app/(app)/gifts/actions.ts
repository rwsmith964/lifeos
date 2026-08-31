"use server";

import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { giftSuggestionsRepo, giftsRepo } from "@/lib/db/repositories/gifts";
import { suggestionToGivenGiftInsert } from "@/lib/gifts/convert";
import type { SuggestionStatus } from "@/lib/db/database.types";

export async function updateSuggestionStatusAction(suggestionId: string, status: SuggestionStatus) {
  const { supabase } = await requireHouseholdContext();
  await giftSuggestionsRepo.update(supabase, suggestionId, { status });
  // P1-12 bug found in live-verification: a status change (Save, Move
  // back, Dismiss, or Undo of either) affects both /gifts (suggested) and
  // /gifts/saved (saved) — revalidating only /gifts left the Saved gifts
  // page showing stale data (esp. its empty state) until a manual reload,
  // which looked exactly like "Undo doesn't work" to a user watching that
  // page. Both routes read the same underlying query, so both must be
  // invalidated on every write.
  revalidatePath("/gifts");
  revalidatePath("/gifts/saved");
}

/**
 * P3-4: the terminal step of the shortlist lifecycle (Saved -> Ordered ->
 * Given). Unlike the other status transitions above, "Given" isn't just a
 * status flip on the suggestion row — it also writes a real, permanent
 * entry into Gift history (the `gifts` table) per the spec's literal
 * wording ("writing 'Given' into Gift history"), then marks the
 * suggestion `converted_to_gift` so it drops off both the Gifts and Saved
 * gifts lists (the existing terminal state for a fulfilled suggestion —
 * see listActiveAndConvertedSuggestionTitlesForPerson).
 */
export async function markSuggestionGivenAction(suggestionId: string): Promise<string> {
  const { supabase } = await requireHouseholdContext();
  const suggestion = await giftSuggestionsRepo.getById(supabase, suggestionId);
  if (!suggestion) throw new Error("That suggestion no longer exists.");

  const gift = await giftsRepo.create(supabase, suggestionToGivenGiftInsert(suggestion));
  await giftSuggestionsRepo.update(supabase, suggestionId, { status: "converted_to_gift" });

  revalidatePath("/gifts");
  revalidatePath("/gifts/saved");
  revalidatePath(`/people/${suggestion.person_id}`);
  return gift.id;
}

/**
 * Undo for markSuggestionGivenAction (P3-4) — every async action needs
 * undo where possible, and "Given" writes a real, permanent history row so
 * a plain status revert isn't enough: this also deletes the gift row that
 * was just created, so a mis-click doesn't leave a phantom entry sitting
 * in Gift history.
 */
export async function undoMarkGivenAction(suggestionId: string, giftId: string) {
  const { supabase } = await requireHouseholdContext();
  await giftsRepo.remove(supabase, giftId);
  const suggestion = await giftSuggestionsRepo.update(supabase, suggestionId, { status: "ordered" });

  revalidatePath("/gifts");
  revalidatePath("/gifts/saved");
  revalidatePath(`/people/${suggestion.person_id}`);
}
