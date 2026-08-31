"use server";

import { revalidatePath } from "next/cache";
import { format } from "date-fns";
import { requireHouseholdContext } from "@/lib/auth/session";
import { userActivitiesRepo, activityLocationsRepo } from "@/lib/db/repositories/activities";
import { tripIdeasRepo } from "@/lib/db/repositories/trip-ideas";
import { activityLocationInsertSchema } from "@/lib/db/schemas";
import { friendlyMutationError } from "@/lib/db/errors";
import { geocodeAddress } from "@/lib/external/geocode";

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

// D-095 (P3-2): activities can genuinely happen at more than one place —
// the user's own example was golf modelled as two separate activities
// instead of one activity with two locations. activity_locations has
// always supported many rows per activity (see the schema/repo), and the
// edit form already manages one of them (the "usual location" fields),
// but there was no way to add, see, or remove a second one. These two
// actions manage the rest of the list; the primary/"usual" location keeps
// going through the existing POST/PATCH route handler unchanged.
export async function addActivityLocationAction(
  activityId: string,
  _prevState: SimpleFormState,
  formData: FormData
): Promise<SimpleFormState> {
  const { supabase, household } = await requireHouseholdContext();
  const activity = await userActivitiesRepo.getById(supabase, activityId);
  if (!activity || activity.household_id !== household.id) {
    return { error: "Activity not found." };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Location name is required." };
  const address = String(formData.get("address") ?? "").trim() || null;

  let lat = formData.get("lat") ? Number(formData.get("lat")) : null;
  let lng = formData.get("lng") ? Number(formData.get("lng")) : null;
  // Same additive geocode-on-save fallback as the main location fields in
  // POST/PATCH /api/activities (D-070) — only fires when no manual lat/lng
  // was entered.
  if (lat == null && lng == null) {
    const geocoded = await geocodeAddress(address ?? name);
    if (geocoded.status === "ok") {
      lat = geocoded.result.lat;
      lng = geocoded.result.lng;
    }
  }

  const parsed = activityLocationInsertSchema.safeParse({
    user_activity_id: activityId,
    name,
    address,
    lat,
    lng,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Couldn't save that location." };
  }

  try {
    await activityLocationsRepo.create(supabase, parsed.data);
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't add that location — please try again." }) };
  }
  revalidatePath(`/activities/${activityId}/edit`);
  revalidatePath("/activities");
  return { error: null };
}

export async function removeActivityLocationAction(activityId: string, locationId: string): Promise<SimpleFormState> {
  const { supabase, household } = await requireHouseholdContext();
  const activity = await userActivitiesRepo.getById(supabase, activityId);
  if (!activity || activity.household_id !== household.id) {
    return { error: "Activity not found." };
  }
  try {
    await activityLocationsRepo.remove(supabase, locationId);
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't remove that location — please try again." }) };
  }
  revalidatePath(`/activities/${activityId}/edit`);
  revalidatePath("/activities");
  return { error: null };
}
