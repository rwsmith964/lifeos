"use server";

import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { userActivitiesRepo } from "@/lib/db/repositories/activities";

export async function deactivateActivityAction(activityId: string): Promise<void> {
  const { supabase } = await requireHouseholdContext();
  await userActivitiesRepo.update(supabase, activityId, { is_active: false });
  revalidatePath("/activities");
}
