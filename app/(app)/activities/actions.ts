"use server";

import { revalidatePath } from "next/cache";
import { format } from "date-fns";
import { requireHouseholdContext } from "@/lib/auth/session";
import { getZonedNow } from "@/lib/timezones";
import { userActivitiesRepo, activityLocationsRepo } from "@/lib/db/repositories/activities";
import { tripIdeasRepo } from "@/lib/db/repositories/trip-ideas";
import { activityLocationInsertSchema } from "@/lib/db/schemas";
import { friendlyMutationError } from "@/lib/db/errors";
import { geocodeAddress } from "@/lib/external/geocode";
import { searchNearbyPlaces, type PlaceSuggestion } from "@/lib/external/places";
import { usersRepo } from "@/lib/db/repositories/households";

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
  const { supabase, timezone } = await requireHouseholdContext();
  // D-143: household-local today, not a bare `new Date()` -- see
  // lib/timezones.ts's getZonedNow for why.
  const today = format(getZonedNow(timezone), "yyyy-MM-dd");
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

  // QUEUE-043: when this location came from a "Find nearby" suggestion
  // (see suggestNearbyLocationsAction below) instead of manual entry, the
  // hidden googlePlaceId field carries the Places result's id through so
  // it isn't lost -- stored in the existing external_ids bag, same shape
  // usgs_gauge/noaa_station already use for other activity types.
  const googlePlaceId = String(formData.get("googlePlaceId") ?? "").trim();

  const parsed = activityLocationInsertSchema.safeParse({
    user_activity_id: activityId,
    name,
    address,
    lat,
    lng,
    external_ids: googlePlaceId ? { google_place_id: googlePlaceId } : undefined,
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

export interface SuggestNearbyLocationsResult {
  error: string | null;
  suggestions: PlaceSuggestion[];
}

// QUEUE-043: "Find nearby" button on the activity edit page — a read-only
// lookup (no mutation, so plain SimpleFormState's revalidatePath pattern
// doesn't apply) that biases the search around the signed-in user's own
// home_lat/home_lng (Settings > home address, D-060) since that's the
// only per-person location LifeOS already has, rather than adding a new
// "search near ___" input on top of the query box.
export async function suggestNearbyLocationsAction(
  activityId: string,
  query: string
): Promise<SuggestNearbyLocationsResult> {
  const { supabase, household, userId } = await requireHouseholdContext();
  const activity = await userActivitiesRepo.getById(supabase, activityId);
  if (!activity || activity.household_id !== household.id) {
    return { error: "Activity not found.", suggestions: [] };
  }

  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return { error: "Type what you're looking for, e.g. \u201cgolf course\u201d.", suggestions: [] };
  }

  const user = await usersRepo.getById(supabase, userId);
  if (user?.home_lat == null || user?.home_lng == null) {
    return {
      error: "Set your home address in Settings first so we know where \u201cnearby\u201d means.",
      suggestions: [],
    };
  }

  const outcome = await searchNearbyPlaces(trimmedQuery, { lat: user.home_lat, lng: user.home_lng });
  if (!outcome.available) {
    if (outcome.reason === "not_configured") {
      return {
        error: "Location suggestions aren't set up yet \u2014 ask whoever manages LifeOS to add a Google Places API key.",
        suggestions: [],
      };
    }
    return { error: outcome.message ?? "Couldn't search for nearby places \u2014 please try again.", suggestions: [] };
  }

  if (outcome.places.length === 0) {
    return { error: `No results for \u201c${trimmedQuery}\u201d near your home address.`, suggestions: [] };
  }

  return { error: null, suggestions: outcome.places };
}
