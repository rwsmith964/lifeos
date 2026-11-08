"use server";

// Answering an invitation from inside the app. Accepting puts the event on the
// invitee's OWN calendar, with the host's details and the note written for
// them, so drive-time and prep suggestions (shopping, cooking) appear the same
// as for any event they made themselves.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireHouseholdContext } from "@/lib/auth/session";
import { calendarEventsRepo } from "@/lib/db/repositories/calendar";
import { eventInvitationsRepo, getInvitationDetails, respondToInvitation } from "@/lib/db/repositories/event-invitations";
import { friendlyMutationError } from "@/lib/db/errors";
import { PERSONAL_NOTE_PREFIX } from "@/lib/events/errands";
import { summarizeItinerary } from "@/lib/events/invite-plan";

export interface InvitationActionResult {
  error: string | null;
}

export async function respondToInvitationInAppAction(
  token: string,
  status: "accepted" | "declined" | "maybe"
): Promise<InvitationActionResult> {
  if (!z.string().uuid().safeParse(token).success || !["accepted", "declined", "maybe"].includes(status)) {
    return { error: "That invitation isn't valid." };
  }
  const { supabase, household, selfPerson, userId } = await requireHouseholdContext();

  try {
    // Only an invitation addressed to this account (RLS also enforces it).
    const [invitation] = await eventInvitationsRepo.list(supabase, (q) => q.eq("token", token).eq("invitee_user_id", userId).limit(1));
    if (!invitation) return { error: "That invitation wasn't found." };

    await respondToInvitation(supabase, token, status);

    if (status === "accepted" && !invitation.invitee_event_id) {
      const details = await getInvitationDetails(supabase, token);
      if (!details) return { error: "That invitation wasn't found." };

      const description = [
        details.hostName ? `Hosted by ${details.hostName}` : null,
        details.eventDescription,
        details.itinerary.length > 0 ? `Plan:\n${summarizeItinerary(details.itinerary)}` : null,
        details.personalNotes ? `${PERSONAL_NOTE_PREFIX}${details.personalNotes}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      const copy = await calendarEventsRepo.create(supabase, {
        household_id: household.id,
        created_by_person_id: selfPerson.id,
        title: details.eventTitle,
        description,
        starts_at: details.startsAt,
        ends_at: details.endsAt,
        all_day: details.allDay,
        location: details.location,
        location_lat: details.locationLat,
        location_lng: details.locationLng,
        event_type: "family",
        external_source: "lifeos_invite",
        external_id: token,
      });
      const { error } = await supabase.rpc("link_invitation_copy", { p_token: token, p_event_id: copy.id });
      if (error) console.error("link_invitation_copy failed (non-fatal):", error);
    }
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't save your answer — please try again." }) };
  }
  revalidatePath("/calendar");
  return { error: null };
}
