"use server";

import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { householdsRepo } from "@/lib/db/repositories/households";
import { usersRepo } from "@/lib/db/repositories/households";
import { householdInsertSchema, userInsertSchema } from "@/lib/db/schemas";
import { friendlyMutationError } from "@/lib/db/errors";

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
    // Was set only at signup time with no way to change it afterward
    // (Phase 3 backlog: "Gifts tab doesn't expose the scan horizon
    // setting") — households that wanted a longer or shorter lead time on
    // gift suggestions had no self-service path to adjust it.
    gift_scan_horizon_days: Number(formData.get("giftScanHorizonDays") ?? household.gift_scan_horizon_days),
  });
  if (!parsedHousehold.success) {
    return { error: parsedHousehold.error.issues[0]?.message ?? "Invalid input.", saved: false };
  }

  // householdInsertSchema is shared with a `.partial()` caller elsewhere,
  // so this cross-field check can't live on the schema itself (`.refine()`
  // isn't compatible with `.partial()`) — checked here instead.
  const { default_gift_budget_min_cents: min, default_gift_budget_max_cents: max } = parsedHousehold.data;
  if (min != null && max != null && max < min) {
    return { error: "Max must be at least the minimum.", saved: false };
  }

  try {
    await householdsRepo.update(supabase, household.id, parsedHousehold.data);

    const timezone = String(formData.get("timezone") ?? "").trim();
    if (timezone) {
      const parsedUser = userInsertSchema.partial().safeParse({ timezone });
      if (parsedUser.success) {
        await usersRepo.update(supabase, userId, parsedUser.data);
      }
    }
  } catch (error) {
    return {
      error: friendlyMutationError(error, { fallback: "Couldn't save settings — please try again." }),
      saved: false,
    };
  }

  revalidatePath("/settings");
  return { error: null, saved: true };
}
