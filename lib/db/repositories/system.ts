import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type {
  AiUsageLogInsert,
  AiUsageLogRow,
  BriefInsert,
  BriefRow,
  BriefUpdate,
  DeviceTokenInsert,
  DeviceTokenRow,
  ExternalDataCacheInsert,
  ExternalDataCacheRow,
  NotificationInsert,
  NotificationRow,
  NotificationUpdate,
  WeekendPlanInsert,
  WeekendPlanRow,
  WeekendPlanUpdate,
} from "../database.types";

export const briefsRepo = createRepository<BriefRow, BriefInsert, BriefUpdate>("briefs");

export const externalDataCacheRepo = createRepository<
  ExternalDataCacheRow,
  ExternalDataCacheInsert,
  never
>("external_data_cache");

export const aiUsageLogRepo = createRepository<AiUsageLogRow, AiUsageLogInsert, never>(
  "ai_usage_log"
);

export const deviceTokensRepo = createRepository<DeviceTokenRow, DeviceTokenInsert, never>(
  "device_tokens"
);

export const notificationsRepo = createRepository<
  NotificationRow,
  NotificationInsert,
  NotificationUpdate
>("notifications");

export const weekendPlansRepo = createRepository<WeekendPlanRow, WeekendPlanInsert, WeekendPlanUpdate>(
  "weekend_plans"
);

export async function getWeekendPlanForDate(
  client: SupabaseClient,
  householdId: string,
  forDate: string
): Promise<WeekendPlanRow | null> {
  const rows = await weekendPlansRepo.list(client, (q) =>
    q.eq("household_id", householdId).eq("for_date", forDate).limit(1)
  );
  return rows[0] ?? null;
}

export async function getBriefForPersonAndDate(
  client: SupabaseClient,
  personId: string,
  brief_date: string
): Promise<BriefRow | null> {
  const rows = await briefsRepo.list(client, (q) =>
    q.eq("for_person_id", personId).eq("brief_date", brief_date).limit(1)
  );
  return rows[0] ?? null;
}

export async function getCachedExternalData(
  client: SupabaseClient,
  source: string,
  cacheKey: string
): Promise<ExternalDataCacheRow | null> {
  const rows = await externalDataCacheRepo.list(client, (q) =>
    q
      .eq("source", source)
      .eq("cache_key", cacheKey)
      .gt("expires_at", new Date().toISOString())
      .limit(1)
  );
  return rows[0] ?? null;
}

/** Upsert-by-(source, cache_key), since the cache has a unique index on it. */
export async function upsertExternalDataCache(
  client: SupabaseClient,
  row: ExternalDataCacheInsert
): Promise<ExternalDataCacheRow> {
  const { data, error } = await client
    .from("external_data_cache")
    .upsert(row as never, { onConflict: "source,cache_key" })
    .select("*")
    .single();
  if (error) throw error;
  return data as ExternalDataCacheRow;
}

/**
 * M-01 follow-up: `sinceIso` is the caller's own zoned start-of-day instant
 * (see lib/ai/client.ts's callAi), not computed here -- this used to build
 * `startOfDay` from the server's bare local process time, which is UTC on
 * Vercel, so a household's daily AI-spend ceiling reset at UTC midnight
 * (mid-afternoon Pacific) instead of their actual local midnight.
 */
export async function sumAiSpendToday(
  client: SupabaseClient,
  householdId: string,
  sinceIso: string
): Promise<number> {
  const { data, error } = await client
    .from("ai_usage_log")
    .select("estimated_cost_cents")
    .eq("household_id", householdId)
    .gte("created_at", sinceIso);
  if (error) throw error;
  return ((data ?? []) as { estimated_cost_cents: number }[]).reduce(
    (sum, row) => sum + Number(row.estimated_cost_cents),
    0
  );
}

export async function listUnreadNotifications(
  client: SupabaseClient,
  personId: string
): Promise<NotificationRow[]> {
  return notificationsRepo.list(client, (q) =>
    q.eq("person_id", personId).is("read_at", null).order("created_at", { ascending: false })
  );
}

export async function listNotificationsForPerson(
  client: SupabaseClient,
  personId: string,
  limit = 50
): Promise<NotificationRow[]> {
  return notificationsRepo.list(client, (q) =>
    q.eq("person_id", personId).order("created_at", { ascending: false }).limit(limit)
  );
}
