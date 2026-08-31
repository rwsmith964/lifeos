"use server";

import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { householdsRepo } from "@/lib/db/repositories/households";
import { usersRepo } from "@/lib/db/repositories/households";
import { householdInsertSchema, userInsertSchema } from "@/lib/db/schemas";
import { friendlyMutationError } from "@/lib/db/errors";
import { geocodeAddress } from "@/lib/external/geocode";

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
    // P3-5: checkboxes only appear in FormData when checked, so an unchecked
    // box means "not present" here, not "false" — this correctly turns email
    // delivery off when the household unchecks it. Push isn't included: its
    // checkbox is disabled (not implemented until the v2 Expo shell), so it
    // never submits and is never persisted as an enabled channel.
    notification_channels: formData.get("notifyEmail") != null ? ["email"] : [],
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

  // Home address feeds two features that were previously permanently
  // unreachable with no UI at all: weekend-plan generation ("no
  // candidates" is really "no home_lat/home_lng on the owner", not
  // anything to do with Activities — see KNOWN-ISSUES.md) and the
  // brief's weather forecast (lib/brief/generate.ts). Only re-geocode
  // when the text actually changed, both to respect Nominatim's usage
  // policy (avoid hammering it on every unrelated settings save) and so
  // editing the timezone alone can't accidentally clear/refetch location.
  const homeAddressInput = formData.get("homeAddress");
  const homeAddress = homeAddressInput == null ? null : String(homeAddressInput).trim();
  const currentUser = homeAddress !== null ? await usersRepo.getById(supabase, userId) : null;
  const previousHomeAddress = currentUser?.home_address ?? "";

  try {
    await householdsRepo.update(supabase, household.id, parsedHousehold.data);

    const timezone = String(formData.get("timezone") ?? "").trim();
    if (timezone) {
      const parsedUser = userInsertSchema.partial().safeParse({ timezone });
      if (parsedUser.success) {
        await usersRepo.update(supabase, userId, parsedUser.data);
      }
    }

    if (homeAddress !== null && homeAddress !== (previousHomeAddress ?? "")) {
      if (homeAddress === "") {
        await usersRepo.update(supabase, userId, { home_address: null, home_lat: null, home_lng: null });
      } else {
        const geocoded = await geocodeAddress(homeAddress);
        if (geocoded.status !== "ok") {
          return {
            error:
              geocoded.status === "not_found"
                ? "Couldn't find that address — try adding a city and state, or a full street address."
                : "Couldn't look up that address right now — please try again in a moment.",
            saved: false,
          };
        }
        const parsedUser = userInsertSchema.partial().safeParse({
          home_address: homeAddress,
          home_lat: geocoded.result.lat,
          home_lng: geocoded.result.lng,
        });
        if (!parsedUser.success) {
          return { error: parsedUser.error.issues[0]?.message ?? "Invalid address.", saved: false };
        }
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
  revalidatePath("/calendar");
  revalidatePath("/");
  return { error: null, saved: true };
}
