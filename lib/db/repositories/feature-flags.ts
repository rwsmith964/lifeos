import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type { FeatureFlagInsert, FeatureFlagRow, FeatureFlagUpdate } from "../database.types";

export const featureFlagsRepo = createRepository<FeatureFlagRow, FeatureFlagInsert, FeatureFlagUpdate>(
  "feature_flags"
);

export async function listFeatureFlagsForHousehold(
  client: SupabaseClient,
  householdId: string
): Promise<FeatureFlagRow[]> {
  return featureFlagsRepo.list(client, (q) => q.eq("household_id", householdId));
}

export async function getFeatureFlagRow(
  client: SupabaseClient,
  householdId: string,
  flagKey: string
): Promise<FeatureFlagRow | null> {
  const { data, error } = await client
    .from("feature_flags")
    .select("*")
    .eq("household_id", householdId)
    .eq("flag_key", flagKey)
    .maybeSingle();
  if (error) throw error;
  return data as FeatureFlagRow | null;
}
