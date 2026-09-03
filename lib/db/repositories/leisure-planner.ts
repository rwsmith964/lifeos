// Module 2: Leisure Planner (D-118, leisure_planner_v2 flag) -- repository
// layer for the three new tables added by
// supabase/migrations/20260901000003_module2_leisure_planner.sql, plus
// finders that read the new opportunities.score_breakdown column.
// Every function here is additive: nothing in this file is called by any
// existing route/action, so it has zero effect on current behavior until
// a flagged caller uses it.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type {
  ActivityTypeViabilityConfigInsert,
  ActivityTypeViabilityConfigRow,
  ActivityTypeViabilityConfigUpdate,
  GearChecklistItemInsert,
  GearChecklistItemRow,
  GearChecklistItemUpdate,
  LeisureOutingLogInsert,
  LeisureOutingLogRow,
  LeisureOutingLogUpdate,
} from "../database.types";

export const activityTypeViabilityConfigsRepo = createRepository<
  ActivityTypeViabilityConfigRow,
  ActivityTypeViabilityConfigInsert,
  ActivityTypeViabilityConfigUpdate
>("activity_type_viability_configs");

export const gearChecklistItemsRepo = createRepository<
  GearChecklistItemRow,
  GearChecklistItemInsert,
  GearChecklistItemUpdate
>("gear_checklist_items");

export const leisureOutingLogsRepo = createRepository<
  LeisureOutingLogRow,
  LeisureOutingLogInsert,
  LeisureOutingLogUpdate
>("leisure_outing_logs");

/** Every declared viability config for a household, for a Settings-style
 * management list. */
export async function listViabilityConfigsForHousehold(
  client: SupabaseClient,
  householdId: string
): Promise<ActivityTypeViabilityConfigRow[]> {
  return activityTypeViabilityConfigsRepo.list(client, (q) =>
    q.eq("household_id", householdId).order("activity_type_key", { ascending: true })
  );
}

/** The one config row for a given normalized activity type key, or null if
 * the household never declared one -- callers treat "no row" as "no
 * declared viability inputs for this type," not an error. */
export async function getViabilityConfigForType(
  client: SupabaseClient,
  householdId: string,
  activityTypeKey: string
): Promise<ActivityTypeViabilityConfigRow | null> {
  const rows = await activityTypeViabilityConfigsRepo.list(client, (q) =>
    q.eq("household_id", householdId).eq("activity_type_key", activityTypeKey).limit(1)
  );
  return rows[0] ?? null;
}

/** Gear checklist items specific to one activity instance (not the shared
 * type-level defaults -- see listGearChecklistItemsForType and
 * resolveGearChecklist in lib/planner/gear-checklist.ts for merging both). */
export async function listGearChecklistItemsForActivity(
  client: SupabaseClient,
  userActivityId: string
): Promise<GearChecklistItemRow[]> {
  return gearChecklistItemsRepo.list(client, (q) =>
    q.eq("user_activity_id", userActivityId).order("sort_order", { ascending: true })
  );
}

/** Shared type-level default gear checklist items for a household + normalized activity type key. */
export async function listGearChecklistItemsForType(
  client: SupabaseClient,
  householdId: string,
  activityTypeKey: string
): Promise<GearChecklistItemRow[]> {
  return gearChecklistItemsRepo.list(client, (q) =>
    q
      .eq("household_id", householdId)
      .eq("activity_type_key", activityTypeKey)
      .order("sort_order", { ascending: true })
  );
}

/** Every type-level default gear item declared for the household, across all
 * activity types -- for the Activities page's "default gear checklists"
 * management section, which groups them by activity_type_key client-side. */
export async function listAllTypeGearChecklistDefaultsForHousehold(
  client: SupabaseClient,
  householdId: string
): Promise<GearChecklistItemRow[]> {
  return gearChecklistItemsRepo.list(client, (q) =>
    q
      .eq("household_id", householdId)
      .not("activity_type_key", "is", null)
      .order("activity_type_key", { ascending: true })
      .order("sort_order", { ascending: true })
  );
}

/** Outing logs for one activity, most recent first -- an activity-detail "outing history" list. */
export async function listOutingLogsForActivity(
  client: SupabaseClient,
  userActivityId: string,
  limit = 25
): Promise<LeisureOutingLogRow[]> {
  return leisureOutingLogsRepo.list(client, (q) =>
    q.eq("user_activity_id", userActivityId).order("occurred_on", { ascending: false }).limit(limit)
  );
}

/** All outing logs for a household, most recent first -- for a household-wide leisure history view. */
export async function listOutingLogsForHousehold(
  client: SupabaseClient,
  householdId: string,
  limit = 50
): Promise<LeisureOutingLogRow[]> {
  return leisureOutingLogsRepo.list(client, (q) =>
    q.eq("household_id", householdId).order("occurred_on", { ascending: false }).limit(limit)
  );
}
