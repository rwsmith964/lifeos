"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { activityLocationsRepo, userActivitiesRepo } from "@/lib/db/repositories/activities";
import { userActivityInsertSchema, activityLocationInsertSchema } from "@/lib/db/schemas";

export interface ActivityFormState {
  error: string | null;
}

export async function createActivityAction(
  _prevState: ActivityFormState,
  formData: FormData
): Promise<ActivityFormState> {
  const { supabase, household, selfPerson } = await requireHouseholdContext();

  const preferredCompanions = String(formData.get("preferredCompanionIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const parsed = userActivityInsertSchema.safeParse({
    household_id: household.id,
    person_id: selfPerson.id,
    activity_type: String(formData.get("activityType") ?? "").trim(),
    enjoyment_rank: Number(formData.get("enjoymentRank") ?? 5),
    typical_duration_minutes: Number(formData.get("typicalDurationMinutes") ?? 120),
    requires_prep: formData.get("requiresPrep") === "on",
    prep_lead_time_hours: formData.get("prepLeadTimeHours") ? Number(formData.get("prepLeadTimeHours")) : null,
    preferred_companions: preferredCompanions,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const activity = await userActivitiesRepo.create(supabase, parsed.data);

  const locationName = String(formData.get("locationName") ?? "").trim();
  if (locationName) {
    const locationParsed = activityLocationInsertSchema.safeParse({
      user_activity_id: activity.id,
      name: locationName,
      address: String(formData.get("locationAddress") ?? "").trim() || null,
      lat: formData.get("locationLat") ? Number(formData.get("locationLat")) : null,
      lng: formData.get("locationLng") ? Number(formData.get("locationLng")) : null,
    });
    if (locationParsed.success) {
      await activityLocationsRepo.create(supabase, locationParsed.data);
    }
  }

  revalidatePath("/activities");
  redirect("/activities");
}

export async function deactivateActivityAction(activityId: string): Promise<void> {
  const { supabase } = await requireHouseholdContext();
  await userActivitiesRepo.update(supabase, activityId, { is_active: false });
  revalidatePath("/activities");
}
