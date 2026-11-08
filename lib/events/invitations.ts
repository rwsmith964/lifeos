// Sends the invitations for an event: in-app to connected accounts, by email
// to people who aren't on LifeOS. People in the same household don't need one
// (the event is already on their calendar).
import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import type { CalendarEventRow, PersonRow } from "../db/database.types";
import { eventInvitationsRepo, listInvitationsForEvent } from "../db/repositories/event-invitations";
import { sendEventInvitationEmail } from "../notifications/invite-email";
import { deliveryFor } from "./invite-plan";

export interface InvitationOutcome {
  /** Names invited this time (new invitations). */
  invited: string[];
  /** Names with no account and no email, who could not be invited. */
  missingContact: string[];
}

export function whenText(event: Pick<CalendarEventRow, "starts_at" | "ends_at" | "all_day">): string {
  // Stored as floating wall-clock values, so format the UTC fields as-is.
  const start = new Date(event.starts_at);
  if (event.all_day) return format(start, "EEEE, MMMM d");
  return `${format(start, "EEEE, MMMM d")} at ${format(start, "h:mm a")}`;
}

export async function createInvitationsForEvent(
  supabase: SupabaseClient,
  params: {
    householdId: string;
    hostName: string;
    event: CalendarEventRow;
    attendees: Array<{ person: PersonRow; note: string }>;
    origin: string;
  }
): Promise<InvitationOutcome> {
  const existing = await listInvitationsForEvent(supabase, params.event.id);
  const existingByPerson = new Map(existing.filter((i) => i.person_id).map((i) => [i.person_id as string, i]));

  const outcome: InvitationOutcome = { invited: [], missingContact: [] };

  for (const { person, note } of params.attendees) {
    const delivery = deliveryFor(person);
    const name = person.nickname || person.full_name;
    if (delivery === "member") continue;
    if (delivery === "none") {
      outcome.missingContact.push(name);
      continue;
    }

    const already = existingByPerson.get(person.id);
    if (already) {
      // Already invited: just keep their note current, never re-send.
      if (already.personal_notes !== note) await eventInvitationsRepo.update(supabase, already.id, { personal_notes: note });
      continue;
    }

    const invitation = await eventInvitationsRepo.create(supabase, {
      event_id: params.event.id,
      household_id: params.householdId,
      person_id: person.id,
      invitee_user_id: person.linked_user_id,
      invitee_email: person.email,
      personal_notes: note,
    });
    outcome.invited.push(name);

    if (person.email) {
      await sendEventInvitationEmail({
        to: person.email,
        hostName: params.hostName,
        eventTitle: params.event.title,
        whenText: whenText(params.event),
        rsvpUrl: `${params.origin}/rsvp/${invitation.token}`,
        personalNote: note || undefined,
      }).catch((error) => console.error("Event invitation email failed (non-fatal):", error));
    }
  }

  return outcome;
}
