"use server";

// Server Actions for the People page's Childcare section (D-060). Kept
// separate from [id]/actions.ts (single-person CRUD) since this operates
// across two people (requester + provider) plus a household-scoped
// request, closer in shape to household-invite-actions.ts than to a
// single person's edit form.

import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { peopleRepo } from "@/lib/db/repositories/people";
import { usersRepo } from "@/lib/db/repositories/households";
import { childcareRequestsRepo } from "@/lib/db/repositories/childcare";
import { childcareRequestInsertSchema } from "@/lib/db/schemas";
import { friendlyMutationError } from "@/lib/db/errors";
import { geocodeAddress } from "@/lib/external/geocode";
import { getTravelTime } from "@/lib/external/travel";
import { getSiteOrigin } from "@/lib/http/site-origin";
import { sendChildcareRequestEmail } from "@/lib/notifications/childcare-email";

export interface ChildcareRequestFormState {
  error: string | null;
  sent: boolean;
}

const EXPIRES_AFTER_MS = 3 * 24 * 60 * 60 * 1000; // 3 days — shorter than a
// household invite's 7 days, since childcare requests are always tied to a
// specific near-term date; an un-answered request past a few days is
// almost always moot, not just stale.

export async function createChildcareRequestAction(
  _prevState: ChildcareRequestFormState,
  formData: FormData
): Promise<ChildcareRequestFormState> {
  const { supabase, household, userId, selfPerson } = await requireHouseholdContext();

  const childPersonIds = formData.getAll("childPersonIds").map(String).filter(Boolean);
  const parsed = childcareRequestInsertSchema.safeParse({
    household_id: household.id,
    requested_by_person_id: selfPerson.id,
    provider_person_id: String(formData.get("providerPersonId") ?? ""),
    child_person_ids: childPersonIds,
    care_date: String(formData.get("careDate") ?? ""),
    care_start_time: String(formData.get("careStartTime") ?? ""),
    care_end_time: String(formData.get("careEndTime") ?? ""),
    event_title: String(formData.get("eventTitle") ?? "").trim() || null,
    custom_note: String(formData.get("customNote") ?? "").trim() || null,
    expires_at: new Date(Date.now() + EXPIRES_AFTER_MS).toISOString(),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input.", sent: false };
  }

  const provider = await peopleRepo.getById(supabase, parsed.data.provider_person_id);
  if (!provider || provider.household_id !== household.id || !provider.is_childcare_provider) {
    return { error: "Pick a person tagged as a childcare provider.", sent: false };
  }
  if (!provider.email) {
    return {
      error: `${provider.nickname || provider.full_name} doesn't have an email on file — add one on their People page first so they can receive the request.`,
      sent: false,
    };
  }

  // Every id in child_person_ids must actually belong to this household —
  // otherwise a crafted request could reference another household's
  // person row in the preview email (D-053-style cross-household leak
  // precedent). The RPC preview joins directly against `people` with no
  // household filter of its own (it trusts the ids on the row it already
  // found by token), so this must be enforced here at write time.
  const children = await Promise.all(parsed.data.child_person_ids.map((id) => peopleRepo.getById(supabase, id)));
  if (children.some((c) => !c || c.household_id !== household.id)) {
    return { error: "One of the selected children isn't in this household.", sent: false };
  }

  // Drive time from the requester's own home (Settings) to the provider's
  // address — both optional, so this degrades to "no estimate" rather
  // than blocking the request when either endpoint isn't geocoded yet.
  let driveMinutes: number | null = null;
  let driveSource: string | null = null;
  const requester = await usersRepo.getById(supabase, userId);
  let providerLat = provider.address_lat;
  let providerLng = provider.address_lng;
  if (providerLat == null && providerLng == null && provider.address) {
    // Address text was set before this feature existed, or geocoding
    // failed silently at save time — try once more here rather than
    // permanently losing the drive-time estimate.
    const geocoded = await geocodeAddress(provider.address);
    if (geocoded.status === "ok") {
      providerLat = geocoded.result.lat;
      providerLng = geocoded.result.lng;
      await peopleRepo.update(supabase, provider.id, {
        address_lat: providerLat,
        address_lng: providerLng,
      });
    }
  }
  if (requester?.home_lat != null && requester?.home_lng != null && providerLat != null && providerLng != null) {
    const travel = await getTravelTime(
      { lat: requester.home_lat, lng: requester.home_lng },
      { lat: providerLat, lng: providerLng }
    );
    driveMinutes = travel.minutes;
    driveSource = travel.source;
  }

  let request;
  try {
    request = await childcareRequestsRepo.create(supabase, {
      ...parsed.data,
      drive_minutes_to_provider: driveMinutes,
      drive_time_source: driveSource,
    });
  } catch (error) {
    return {
      error: friendlyMutationError(error, { fallback: "Couldn't create that childcare request — please try again." }),
      sent: false,
    };
  }

  const origin = await getSiteOrigin();
  const previewUrl = `${origin}/childcare-requests/${request.token}`;
  const childNames = children.filter((c): c is NonNullable<typeof c> => !!c).map((c) => c.nickname || c.full_name);
  const emailResult = await sendChildcareRequestEmail({
    to: provider.email,
    requesterName: selfPerson.nickname || selfPerson.full_name,
    providerName: provider.nickname || provider.full_name,
    householdName: household.name,
    childNames,
    careDate: request.care_date,
    careStartTime: request.care_start_time,
    careEndTime: request.care_end_time,
    eventTitle: request.event_title,
    customNote: request.custom_note,
    driveMinutes: request.drive_minutes_to_provider,
    previewUrl,
  });
  if (!emailResult.delivered) {
    console.warn(`Childcare request email not delivered: ${emailResult.detail}`);
  }

  revalidatePath("/people");
  return { error: null, sent: true };
}

export interface ChildcareMutationState {
  error: string | null;
}

/**
 * Requester-side cancel of a still-pending request. Provider accept/decline
 * goes through the public token-based RPC flow instead (see
 * app/childcare-requests/[token]/actions.ts) — this action is only for the
 * household side, gated by the update policy's owner/adult check (defense
 * in depth, same reasoning as household-invite-actions.ts's own guard).
 */
export async function cancelChildcareRequestAction(requestId: string): Promise<ChildcareMutationState> {
  const { supabase, household } = await requireHouseholdContext();
  const existing = await childcareRequestsRepo.getById(supabase, requestId);
  if (!existing || existing.household_id !== household.id) {
    return { error: "Request not found." };
  }
  if (existing.status !== "pending") {
    return { error: "Only a pending request can be cancelled." };
  }
  try {
    await childcareRequestsRepo.update(supabase, requestId, { status: "cancelled" });
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't cancel that request." }) };
  }
  revalidatePath("/people");
  return { error: null };
}
