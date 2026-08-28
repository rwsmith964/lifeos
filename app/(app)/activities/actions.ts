"use server";

import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { userActivitiesRepo } from "@/lib/db/repositories/activities";
import { tripIdeasRepo } from "@/lib/db/repositories/trip-ideas";
import { friendlyMutationError } from "@/lib/db/errors";

export interface SimpleFormState {
  error: string | null;
}

export async function deactivateActivityAction(activityId: string): Promise<SimpleFormState> {
  const { supabase } = await requireHouseholdContext();
  try {
    await userActivitiesRepo.update(supabase, activityId, { is_active: false });
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't remove that activity — please try again." }) };
  }
  revalidatePath("/activities");
  return { error: null };
}

export async function deleteTripIdeaAction(tripIdeaId: string): Promise<SimpleFormState> {
  const { supabase } = await requireHouseholdContext();
  try {
    await tripIdeasRepo.remove(supabase, tripIdeaId);
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't remove that trip idea — please try again." }) };
  }
  revalidatePath("/activities");
  return { error: null };
}
