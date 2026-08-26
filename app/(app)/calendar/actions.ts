"use server";

import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { calendarEventsRepo, custodyBlocksRepo } from "@/lib/db/repositories/calendar";
import { createSupabaseServiceRoleClient } from "@/lib/db/client-service-role";
import { generateWeekendPlan } from "@/lib/planner/generate";
import { friendlyMutationError } from "@/lib/db/errors";

export interface DeleteActionState {
  error: string | null;
}

export async function deleteCalendarEventAction(eventId: string): Promise<DeleteActionState> {
  const { supabase } = await requireHouseholdContext();
  try {
    await calendarEventsRepo.remove(supabase, eventId);
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't delete this event — please try again." }) };
  }
  revalidatePath("/calendar");
  return { error: null };
}

export async function deleteCustodyBlockAction(blockId: string): Promise<DeleteActionState> {
  const { supabase } = await requireHouseholdContext();
  try {
    await custodyBlocksRepo.remove(supabase, blockId);
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't delete this custody block — please try again." }) };
  }
  revalidatePath("/calendar");
  return { error: null };
}

export interface WeekendPlanActionState {
  error: string | null;
}

export async function generateWeekendPlanAction(): Promise<WeekendPlanActionState> {
  const { household } = await requireHouseholdContext();

  // weekend_plans (and the external_data_cache writes generateWeekendPlan
  // makes along the way) have no insert policy for regular authenticated
  // users by design — only the cron job's service-role client is meant to
  // write them (see the migration comment and DECISIONS.md D-029, which
  // fixed the identical bug for `briefs`). This on-demand path needs the
  // same swap: household.id is already resolved and scoped above, so
  // handing the rest of generation a service-role client doesn't broaden
  // what household it can touch.
  const serviceRoleClient = createSupabaseServiceRoleClient();

  try {
    const result = await generateWeekendPlan(serviceRoleClient, household.id);
    if (result.status === "ai_unavailable" || result.status === "budget_exceeded") {
      return { error: result.reason };
    }
    if (result.status === "no_candidates") {
      return { error: "No activities with a home location configured yet — add one under Activities." };
    }
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't generate a weekend plan — please try again." }) };
  }

  revalidatePath("/calendar");
  return { error: null };
}
