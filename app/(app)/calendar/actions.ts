"use server";

import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { calendarEventsRepo, custodyBlocksRepo } from "@/lib/db/repositories/calendar";
import { generateWeekendPlan } from "@/lib/planner/generate";

export async function deleteCalendarEventAction(eventId: string): Promise<void> {
  const { supabase } = await requireHouseholdContext();
  await calendarEventsRepo.remove(supabase, eventId);
  revalidatePath("/calendar");
}

export async function deleteCustodyBlockAction(blockId: string): Promise<void> {
  const { supabase } = await requireHouseholdContext();
  await custodyBlocksRepo.remove(supabase, blockId);
  revalidatePath("/calendar");
}

export interface WeekendPlanActionState {
  error: string | null;
}

export async function generateWeekendPlanAction(): Promise<WeekendPlanActionState> {
  const { supabase, household } = await requireHouseholdContext();

  const result = await generateWeekendPlan(supabase, household.id);
  if (result.status === "ai_unavailable" || result.status === "budget_exceeded") {
    return { error: result.reason };
  }
  if (result.status === "no_candidates") {
    return { error: "No activities with a home location configured yet — add one under Activities." };
  }

  revalidatePath("/calendar");
  return { error: null };
}
