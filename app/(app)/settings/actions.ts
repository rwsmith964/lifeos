"use server";

import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { householdsRepo } from "@/lib/db/repositories/households";
import { usersRepo } from "@/lib/db/repositories/households";
import { householdInsertSchema, userInsertSchema } from "@/lib/db/schemas";

export interface SettingsFormState {
  error: string | null;
  saved: boolean;
}

export async function updateHouseholdSettingsAction(
  _prevState: SettingsFormState,
  formData: FormData
): Promise<SettingsFormState> {
  const { supabase, household, userId } = await requireHouseholdContext();

  const parsedHousehold = householdInsertSchema.partial().safeParse({
    name: String(formData.get("householdName") ?? household.name),
    default_gift_budget_min_cents: Math.round(Number(formData.get("budgetMin") ?? 0) * 100) || null,
    default_gift_budget_max_cents: Math.round(Number(formData.get("budgetMax") ?? 0) * 100) || null,
    brief_time: String(formData.get("briefTime") ?? household.brief_time),
  });
  if (!parsedHousehold.success) {
    return { error: parsedHousehold.error.issues[0]?.message ?? "Invalid input.", saved: false };
  }

  await householdsRepo.update(supabase, household.id, parsedHousehold.data);

  const timezone = String(formData.get("timezone") ?? "").trim();
  if (timezone) {
    const parsedUser = userInsertSchema.partial().safeParse({ timezone });
    if (parsedUser.success) {
      await usersRepo.update(supabase, userId, parsedUser.data);
    }
  }

  revalidatePath("/settings");
  return { error: null, saved: true };
}
