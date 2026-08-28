import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type { OpportunityInsert, OpportunityRow, OpportunityUpdate } from "../database.types";

export const opportunitiesRepo = createRepository<OpportunityRow, OpportunityInsert, OpportunityUpdate>(
  "opportunities"
);

/** Open, not-yet-expired opportunities for a household, best score first. Used by the /opportunities page and the Brief. */
export async function listOpenOpportunitiesForHousehold(
  client: SupabaseClient,
  householdId: string,
  now: Date = new Date()
): Promise<OpportunityRow[]> {
  return opportunitiesRepo.list(client, (q) =>
    q
      .eq("household_id", householdId)
      .eq("status", "open")
      .gt("expires_at", now.toISOString())
      .order("score", { ascending: false })
      .order("for_date", { ascending: true })
  );
}

/** Open opportunities whose for_date falls within [startDateStr, endDateStr] inclusive — used to fold into the weekend-plan view. */
export async function listOpenOpportunitiesForHouseholdInDateRange(
  client: SupabaseClient,
  householdId: string,
  startDateStr: string,
  endDateStr: string,
  now: Date = new Date()
): Promise<OpportunityRow[]> {
  return opportunitiesRepo.list(client, (q) =>
    q
      .eq("household_id", householdId)
      .eq("status", "open")
      .gt("expires_at", now.toISOString())
      .gte("for_date", startDateStr)
      .lte("for_date", endDateStr)
      .order("score", { ascending: false })
  );
}

/** Idempotency check for the detection job: has this activity already been scored for this date, in any status? */
export async function findExistingActivityOpportunity(
  client: SupabaseClient,
  householdId: string,
  activityId: string,
  forDateStr: string
): Promise<OpportunityRow | null> {
  const rows = await opportunitiesRepo.list(client, (q) =>
    q.eq("household_id", householdId).eq("activity_id", activityId).eq("for_date", forDateStr).limit(1)
  );
  return rows[0] ?? null;
}

/** Idempotency check for the detection job: has this trip idea already been scored for this date, in any status? */
export async function findExistingTripIdeaOpportunity(
  client: SupabaseClient,
  householdId: string,
  tripIdeaId: string,
  forDateStr: string
): Promise<OpportunityRow | null> {
  const rows = await opportunitiesRepo.list(client, (q) =>
    q.eq("household_id", householdId).eq("trip_idea_id", tripIdeaId).eq("for_date", forDateStr).limit(1)
  );
  return rows[0] ?? null;
}
