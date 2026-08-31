"use server";

// Server action for the brain-dump history list (P3-7). Only a delete is
// needed here — creating a batch and re-running it both go through
// app/api/brain-dump/parse/route.ts already (the client fetches it
// directly, same as the existing "Process" flow), so there's nothing to
// duplicate as a Server Action for those two.

import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { brainDumpBatchesRepo } from "@/lib/db/repositories/brain-dump";
import { friendlyMutationError } from "@/lib/db/errors";

export interface BrainDumpBatchMutationState {
  error: string | null;
}

export async function deleteBrainDumpBatchAction(batchId: string): Promise<BrainDumpBatchMutationState> {
  const { supabase, household } = await requireHouseholdContext();
  const batch = await brainDumpBatchesRepo.getById(supabase, batchId);
  if (!batch || batch.household_id !== household.id) {
    return { error: "That brain dump wasn't found." };
  }
  try {
    // RLS (creator or owner/adult) is the actual enforcement here — this
    // household_id check above is just a friendly 404 before hitting the
    // database for a batch that plainly isn't ours.
    await brainDumpBatchesRepo.remove(supabase, batchId);
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't remove that — please try again." }) };
  }
  revalidatePath("/brain-dump");
  return { error: null };
}
