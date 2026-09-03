"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/client-server";
import { createHouseholdWithOwner, usersRepo } from "@/lib/db/repositories/households";
import { peopleRepo } from "@/lib/db/repositories/people";
import { requireHouseholdContext } from "@/lib/auth/session";
import { userInsertSchema } from "@/lib/db/schemas";
import { friendlyMutationError } from "@/lib/db/errors";
import { geocodeAddress } from "@/lib/external/geocode";

export interface OnboardingState {
  error: string | null;
  // D-141: the household-creation step used to redirect straight to "/" —
  // now it hands the newly-created self person back to the client wizard
  // instead, so the questionnaire's later steps (work schedule, interests)
  // can run for "self" the same way they run for every other household
  // member, before the user ever lands on the dashboard.
  selfPersonId?: string;
  selfFullName?: string;
}

export async function createHouseholdAction(
  _prevState: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const householdName = String(formData.get("householdName") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  if (!householdName || !fullName) {
    return { error: "Both fields are required." };
  }

  const birthdate = String(formData.get("birthdate") ?? "").trim();
  if (birthdate && birthdate > new Date().toISOString().slice(0, 10)) {
    return { error: "Birthdate can't be in the future." };
  }

  const household = await createHouseholdWithOwner(supabase, user.id, householdName);
  const self = await peopleRepo.create(supabase, {
    household_id: household.id,
    user_id: user.id,
    full_name: fullName,
    relationship_type: "self",
    birthdate: birthdate || null,
    birth_year_known: formData.get("birthYearKnown") === "on",
    // D-091: carry the auth email onto the self person record so email
    // notifications (Settings > Notification delivery) have somewhere to
    // go for the account owner, same as any other household member.
    email: user.email ?? null,
    // D-068: self's own work schedule showing on their own calendar is the
    // obviously-wanted default; every other person starts opted out.
    show_work_schedule_on_calendar: true,
  });

  return { error: null, selfPersonId: self.id, selfFullName: self.full_name };
}

export interface OnboardingAddressState {
  error: string | null;
  saved: boolean;
}

// D-152: the "other half" of D-151's Brief-page fix, deliberately
// deferred out of that narrower bug fix. Home address was previously only
// reachable from Settings, discovered by no one until they either stumbled onto it
// or hit the new D-151 empty-state prompt on the Brief page days after
// finishing onboarding. This gives every new household a direct,
// skippable chance to set it during the same flow that already asks for
// birthdates and interests — same geocode-on-save behavior as Settings
// (lib/external/geocode.ts), just scoped to a single field with no other
// household settings bundled in, since onboarding has no household row
// values to preserve yet beyond what step 1 already wrote.
export async function setOnboardingHomeAddressAction(
  _prevState: OnboardingAddressState,
  formData: FormData
): Promise<OnboardingAddressState> {
  const { supabase, userId } = await requireHouseholdContext();

  const homeAddress = String(formData.get("homeAddress") ?? "").trim();
  if (!homeAddress) {
    // Skip is a separate client-side action (no submit at all) — an empty
    // submit only happens if Save is clicked with nothing typed, which we
    // treat the same as skip rather than showing an error for a field
    // that was never required.
    return { error: null, saved: true };
  }

  try {
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
  } catch (error) {
    return {
      error: friendlyMutationError(error, { fallback: "Couldn't save your address — please try again." }),
      saved: false,
    };
  }

  return { error: null, saved: true };
}
