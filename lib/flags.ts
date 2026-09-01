import type { SupabaseClient } from "@supabase/supabase-js";
import { featureFlagsRepo, getFeatureFlagRow, listFeatureFlagsForHousehold } from "./db/repositories/feature-flags";

/**
 * Registry of every feature flag introduced by the "Build Brief -- Competitive
 * Parity + Moat Extension" engagement (D-115 onward). Per the Additive
 * Contract (brief Section 3.2): every module ships behind one of these,
 * default OFF, and with every flag off the app must behave identically to
 * before this engagement started. Add a new key here (and nowhere else) when
 * starting a new module so the whole set stays discoverable in one place.
 */
export const FEATURE_FLAGS = {
  relationship_gift_engine_v2: "Module 1: extended person fields, conversation log, moments, gift pipeline v2, reciprocity",
  leisure_planner_v2: "Module 2: declared activity viability inputs, wired condition scoring, visible score breakdown, gear checklists, post-outing capture",
  universal_intake_v2: "Module 3: per-field confidence scoring, review queue, verified completion, action log + undo",
  scheduling_v2: "Module 4: travel-time-aware conflict warnings, preference memory",
  ambient_display: "Module 5: read-only wall-display route",
  execution_draft_only: "Module 6: inbound assistant address, tiered autonomy scaffold, draft-only actions",
  household_layer: "Module 7: meal planning, grocery list, chores",
  brief_registration_v2: "Module 8: generic brief-contributor registration interface",
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

/**
 * True only if a row exists for this household+flag AND enabled=true.
 * Absence of a row (the default state for every household on every flag,
 * since nothing seeds these rows) means "not enabled" -- this is the single
 * fallback every gated route/component/service must call before doing any
 * new-module behavior, so a fresh household with zero feature_flags rows
 * behaves exactly like the app did before this engagement.
 */
export async function isFeatureEnabled(
  client: SupabaseClient,
  householdId: string,
  key: FeatureFlagKey
): Promise<boolean> {
  const row = await getFeatureFlagRow(client, householdId, key);
  return row?.enabled ?? false;
}

/** Every flag's resolved state for a household, keyed the same as FEATURE_FLAGS -- for a Settings toggle list. */
export async function listFeatureFlagStates(
  client: SupabaseClient,
  householdId: string
): Promise<Record<FeatureFlagKey, boolean>> {
  const rows = await listFeatureFlagsForHousehold(client, householdId);
  const enabledByKey = new Map(rows.map((r) => [r.flag_key, r.enabled]));
  const result = {} as Record<FeatureFlagKey, boolean>;
  for (const key of Object.keys(FEATURE_FLAGS) as FeatureFlagKey[]) {
    result[key] = enabledByKey.get(key) ?? false;
  }
  return result;
}

/** Owner/adult-gated by RLS on the feature_flags table itself -- callers don't need to re-check role. */
export async function setFeatureFlag(
  client: SupabaseClient,
  householdId: string,
  key: FeatureFlagKey,
  enabled: boolean
): Promise<void> {
  await featureFlagsRepo.upsert(
    client,
    { household_id: householdId, flag_key: key, enabled },
    "household_id,flag_key"
  );
}
