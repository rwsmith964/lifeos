"use server";

import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { giftSuggestionsRepo } from "@/lib/db/repositories/gifts";
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
