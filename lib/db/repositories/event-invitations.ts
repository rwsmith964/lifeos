import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type { EventInvitationInsert, EventInvitationRow, EventInvitationUpdate, ItineraryItem } from "../database.types";

export const eventInvitationsRepo = createRepository<EventInvitationRow, EventInvitationInsert, EventInvitationUpdate>(
  "event_invitations"
);

export async function listInvitationsForEvent(client: SupabaseClient, eventId: string): Promise<EventInvitationRow[]> {
  return eventInvitationsRepo.list(client, (q) => q.eq("event_id", eventId));
}

/** Invitations addressed to this account that haven't been answered yet. */
export async function listPendingInvitationsForUser(client: SupabaseClient, userId: string): Promise<EventInvitationRow[]> {
  return eventInvitationsRepo.list(client, (q) =>
    q.eq("invitee_user_id", userId).eq("status", "pending").order("created_at", { ascending: false })
  );
}

/** What an invitee is shown (see get_event_invitation in the 20261110000001 migration). */
export interface InvitationDetails {
  invitationId: string;
  status: EventInvitationRow["status"];
  personalNotes: string;
  eventTitle: string;
  eventDescription: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  location: string | null;
  locationLat: number | null;
  locationLng: number | null;
  itinerary: ItineraryItem[];
  hostHousehold: string;
  hostName: string | null;
}

export async function getInvitationDetails(client: SupabaseClient, token: string): Promise<InvitationDetails | null> {
  const { data, error } = await client.rpc("get_event_invitation", { p_token: token });
  if (error) throw error;
  const row = ((data ?? []) as Array<Record<string, unknown>>)[0];
  if (!row) return null;
  return {
    invitationId: row.invitation_id as string,
    status: row.status as EventInvitationRow["status"],
    personalNotes: (row.personal_notes as string) ?? "",
    eventTitle: row.event_title as string,
    eventDescription: (row.event_description as string | null) ?? null,
    startsAt: row.starts_at as string,
    endsAt: row.ends_at as string,
    allDay: !!row.all_day,
    location: (row.location as string | null) ?? null,
    locationLat: (row.location_lat as number | null) ?? null,
    locationLng: (row.location_lng as number | null) ?? null,
    itinerary: (row.itinerary as ItineraryItem[]) ?? [],
    hostHousehold: row.host_household as string,
    hostName: (row.host_name as string | null) ?? null,
  };
}

export async function respondToInvitation(
  client: SupabaseClient,
  token: string,
  status: "accepted" | "declined" | "maybe"
): Promise<void> {
  const { error } = await client.rpc("respond_event_invitation", { p_token: token, p_status: status });
  if (error) throw error;
}
