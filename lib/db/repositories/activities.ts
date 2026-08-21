import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type {
  ActivityLocationInsert,
  ActivityLocationRow,
  ActivityLocationUpdate,
  UserActivityInsert,
  UserActivityRow,
  UserActivityUpdate,
} from "../database.types";

export const userActivitiesRepo = createRepository<
  UserActivityRow,
  UserActivityInsert,
  UserActivityUpdate
>("user_activities");

export const activityLocationsRepo = createRepository<
  ActivityLocationRow,
  ActivityLocationInsert,
  ActivityLocationUpdate
>("activity_locations");

export async function listActiveActivitiesForHousehold(
  client: SupabaseClient,
  householdId: string
): Promise<UserActivityRow[]> {
  return userActivitiesRepo.list(client, (q) =>
    q.eq("household_id", householdId).eq("is_active", true)
  );
}

export async function listLocationsForActivity(
  client: SupabaseClient,
  userActivityId: string
): Promise<ActivityLocationRow[]> {
  return activityLocationsRepo.list(client, (q) => q.eq("user_activity_id", userActivityId));
}

export async function listActivitiesWithLocations(
  client: SupabaseClient,
  householdId: string
): Promise<(UserActivityRow & { locations: ActivityLocationRow[] })[]> {
  const { data, error } = await client
    .from("user_activities")
    .select("*, locations:activity_locations(*)")
    .eq("household_id", householdId)
    .eq("is_active", true);
  if (error) throw error;
  return (data ?? []) as (UserActivityRow & { locations: ActivityLocationRow[] })[];
}
