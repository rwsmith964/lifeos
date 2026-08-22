"use server";

import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { giftSuggestionsRepo } from "@/lib/db/repositories/gifts";
import type { SuggestionStatus } from "@/lib/db/database.types";

export async function updateSuggestionStatusAction(suggestionId: string, status: SuggestionStatus) {
  const { supabase } = await requireHouseholdContext();
  await giftSuggestionsRepo.update(supabase, suggestionId, { status });
  revalidatePath("/gifts");
}
