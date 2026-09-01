import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type {
  CalendarSyncAccountInsert,
  CalendarSyncAccountRow,
  CalendarSyncAccountUpdate,
  HouseholdSchedulingPreferencesInsert,
  HouseholdSchedulingPreferencesRow,
  HouseholdSchedulingPreferencesUpdate,
} from "../database.types";

export const householdSchedulingPreferencesRepo = createRepository<
  HouseholdSchedulingPreferencesRow,
  HouseholdSchedulingPreferencesInsert,
  HouseholdSchedulingPreferencesUpdate
>("household_scheduling_preferences");

export const calendarSyncAccountsRepo = createRepository<
  CalendarSyncAccountRow,
  CalendarSyncAccountInsert,
  CalendarSyncAccountUpdate
>("calendar_sync_accounts");

/** One row per household, or null if the household has never set any scheduling preferences. */
export async function getSchedulingPreferencesForHousehold(
  client: SupabaseClient,
  householdId: string
): Promise<HouseholdSchedulingPreferencesRow | null> {
  const rows = await householdSchedulingPreferencesRepo.list(client, (q) =>
    q.eq("household_id", householdId).limit(1)
  );
  return rows[0] ?? null;
}

/**
 * Creates the row on first write, updates it thereafter — the same
 * "upsert on the natural key" shape as lib/flags.ts's setFeatureFlag, so
 * callers never need to check existence first.
 */
export async function upsertSchedulingPreferencesForHousehold(
  client: SupabaseClient,
  householdId: string,
  update: HouseholdSchedulingPreferencesUpdate
): Promise<HouseholdSchedulingPreferencesRow> {
  return householdSchedulingPreferencesRepo.upsert(
    client,
    { household_id: householdId, ...update } as HouseholdSchedulingPreferencesInsert,
    "household_id"
  );
}

export async function listCalendarSyncAccountsForHousehold(
  client: SupabaseClient,
  householdId: string
): Promise<CalendarSyncAccountRow[]> {
  return calendarSyncAccountsRepo.list(client, (q) => q.eq("household_id", householdId));
}

/** Only accounts with sync_direction='two_way' actually push local events out. */
export async function listTwoWaySyncAccountsForHousehold(
  client: SupabaseClient,
  householdId: string
): Promise<CalendarSyncAccountRow[]> {
  return calendarSyncAccountsRepo.list(client, (q) =>
    q.eq("household_id", householdId).eq("sync_direction", "two_way")
  );
}
