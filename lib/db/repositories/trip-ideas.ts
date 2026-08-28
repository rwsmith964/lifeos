import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type { TripIdeaInsert, TripIdeaRow, TripIdeaUpdate } from "../database.types";

// D-059: someday/bucket-list bigger trips, kept separate from
// user_activities (see lib/db/repositories/activities.ts) since they carry
// a target timeframe, status, and companion picker rather than a
// recurring-outing cadence.
export const tripIdeasRepo = createRepository<TripIdeaRow, TripIdeaInsert, TripIdeaUpdate>("trip_ideas");

export async function listTripIdeasForHousehold(
  client: SupabaseClient,
  householdId: string
): Promise<TripIdeaRow[]> {
  return tripIdeasRepo.list(client, (q) =>
    q.eq("household_id", householdId).order("created_at", { ascending: false })
  );
}
