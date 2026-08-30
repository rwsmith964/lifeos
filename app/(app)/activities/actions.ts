"use server";

import { revalidatePath } from "next/cache";
import { format } from "date-fns";
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

// D-083 (P3-1): quick "I did this today" button on the activity card, for
// when the activity happened outside the Opportunities flow (that flow
// already sets this via updateOpportunityStatusAction's "acted_on" hook —
// see app/(app)/opportunities/actions.ts). Always today's date; edit the
// activity directly for a different date.
export async function markActivityDoneTodayAction(activityId: string): Promise<SimpleFormState> {
  const { supabase } = await requireHouseholdContext();
  const today = format(new Date(), "yyyy-MM-dd");
  try {
    await userActivitiesRepo.update(supabase, activityId, { last_done_at: today });
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't record that — please try again." }) };
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
