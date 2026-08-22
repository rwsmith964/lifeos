// Shared cache-or-fetch helper backing every adapter in this directory
// (Section 4.2 external_data_cache: "Never call an external API twice in a
// day for the same thing"). Each adapter picks its own source name and TTL;
// this module just owns the get-or-fetch-and-store shape.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCachedExternalData, upsertExternalDataCache } from "../db/repositories/system";

export interface CachedFetchResult<T> {
  data: T;
  fromCache: boolean;
  fetchedAt: string;
}

export async function getOrFetchCached<T>(
  client: SupabaseClient,
  source: string,
  cacheKey: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<CachedFetchResult<T>> {
  const cached = await getCachedExternalData(client, source, cacheKey);
  if (cached) {
    return { data: cached.payload as T, fromCache: true, fetchedAt: cached.fetched_at };
  }

  const data = await fetcher();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  await upsertExternalDataCache(client, {
    source,
    cache_key: cacheKey,
    payload: data as unknown,
    expires_at: expiresAt.toISOString(),
  });

  return { data, fromCache: false, fetchedAt: now.toISOString() };
}
