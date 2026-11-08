"use server";

import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { approveSnapDraft, discardSnapDraft } from "@/lib/intake/snap";
import { friendlyMutationError } from "@/lib/db/errors";

export interface SnapActionResult {
  error: string | null;
  message?: string;
}

export async function approveSnapDraftAction(draftId: string, resolvedPersonId: string | null): Promise<SnapActionResult> {
  const { supabase, household, selfPerson, userId, timezone } = await requireHouseholdContext();
  try {
    const outcome = await approveSnapDraft(supabase, household, selfPerson, draftId, resolvedPersonId, userId, timezone);
    revalidatePath("/", "layout");
    return { error: null, message: outcome.confirmationMessage };
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't add that — please try again." }) };
  }
}

export async function discardSnapDraftAction(draftId: string): Promise<SnapActionResult> {
  const { supabase, household } = await requireHouseholdContext();
  try {
    await discardSnapDraft(supabase, household, draftId);
    return { error: null };
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't discard that — please try again." }) };
  }
}
