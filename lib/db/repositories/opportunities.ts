import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type { OpportunityInsert, OpportunityRow, OpportunityUpdate } from "../database.types";

export const opportunitiesRepo = createRepository<OpportunityRow, OpportunityInsert, OpportunityUpdate>(
  "opportunities"
);

/** An opportunity row plus the display name of whatever it's about — needed
 * for P1-6/D-070's family-grouping (dedupe "Golf at Fiddlers Green" and
 * "Golf at Oakway Golf Course" into one "golf" card) and for rendering a
 * name for trip-idea opportunities without a second query per card. */
export interface OpportunityWithSubject extends OpportunityRow {
  subjectName: string;
}

interface OpportunityJoinRow extends OpportunityRow {
  activity: { activity_type: string } | { activity_type: string }[] | null;
  trip_idea: { title: string } | { title: string }[] | null;
}

function firstOrNull<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function withSubjectName(row: OpportunityJoinRow): OpportunityWithSubject {
  const activity = firstOrNull(row.activity);
  const tripIdea = firstOrNull(row.trip_idea);
  const { activity: _activity, trip_idea: _tripIdea, ...opportunity } = row;
  return {
    ...opportunity,
    subjectName: activity?.activity_type ?? tripIdea?.title ?? "Untitled",
  };
}

/** Open, not-yet-expired opportunities for a household, joined with the activity/trip-idea it's about — the input the presentation layer (lib/opportunities/present.ts) needs for family-grouping and display names. Used by the /opportunities page and the Brief (D-070, superseding the old un-joined listOpenOpportunitiesForHousehold). */
export async function listOpenOpportunitiesWithSubjectForHousehold(
  client: SupabaseClient,
  householdId: string,
  now: Date = new Date()
): Promise<OpportunityWithSubject[]> {
  const { data, error } = await client
    .from("opportunities")
    .select("*, activity:user_activities(activity_type), trip_idea:trip_ideas(title)")
    .eq("household_id", householdId)
    .eq("status", "open")
    .gt("expires_at", now.toISOString())
    .order("score", { ascending: false })
    .order("for_date", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as OpportunityJoinRow[]).map(withSubjectName);
}

/** Same as listOpenOpportunitiesWithSubjectForHousehold, scoped to a for_date range — used by the Calendar weekend nudge so its presentation pass only considers candidates actually in that window. */
export async function listOpenOpportunitiesWithSubjectForHouseholdInDateRange(
  client: SupabaseClient,
  householdId: string,
  startDateStr: string,
  endDateStr: string,
  now: Date = new Date()
): Promise<OpportunityWithSubject[]> {
  const { data, error } = await client
    .from("opportunities")
    .select("*, activity:user_activities(activity_type), trip_idea:trip_ideas(title)")
    .eq("household_id", householdId)
    .eq("status", "open")
    .gt("expires_at", now.toISOString())
    .gte("for_date", startDateStr)
    .lte("for_date", endDateStr)
    .order("score", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as OpportunityJoinRow[]).map(withSubjectName);
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
