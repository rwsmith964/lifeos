// NOAA CO-OPS adapter (Section 9.2) — tides and currents, coastal locations
// only. Free, no key. Predictions for a given date don't change, so this
// caches for 12 hours (long enough to avoid refetching within a session,
// short enough that a station id typo gets noticed same-day).
import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import { getOrFetchCached } from "./cache";

const CACHE_TTL_SECONDS = 12 * 60 * 60;

export interface TidePrediction {
  time: string;
  heightFt: number;
  type: "high" | "low";
}

export interface NoaaTidesData {
  stationId: string;
  predictions: TidePrediction[];
}

export interface NoaaTidesOutcome {
  source: "noaa_tides";
  available: boolean;
  data: NoaaTidesData | null;
  fetchedAt: string | null;
  fromCache: boolean;
}

interface NoaaTidesResponse {
  predictions?: { t: string; v: string; type: "H" | "L" }[];
  error?: { message: string };
}

async function fetchNoaaTides(stationId: string, date: Date, fetchImpl: typeof fetch): Promise<NoaaTidesData> {
  const dateStr = format(date, "yyyyMMdd");
  const url = new URL("https://api.tidesandcurrents.noaa.gov/api/prod/datagetter");
  url.searchParams.set("product", "predictions");
  url.searchParams.set("datum", "MLLW");
  url.searchParams.set("station", stationId);
  url.searchParams.set("time_zone", "lst_ldt");
  url.searchParams.set("units", "english");
  url.searchParams.set("interval", "hilo");
  url.searchParams.set("format", "json");
  url.searchParams.set("begin_date", dateStr);
  url.searchParams.set("end_date", dateStr);

  const res = await fetchImpl(url.toString());
  if (!res.ok) throw new Error(`NOAA tides fetch failed: HTTP ${res.status}`);
  const body = (await res.json()) as NoaaTidesResponse;
  if (body.error) throw new Error(`NOAA tides API error: ${body.error.message}`);

  return {
    stationId,
    predictions: (body.predictions ?? []).map((p) => ({
      time: p.t,
      heightFt: Number(p.v),
      type: p.type === "H" ? "high" : "low",
    })),
  };
}

export async function getNoaaTidePredictions(
  client: SupabaseClient,
  stationId: string,
  date: Date,
  options: { fetchImpl?: typeof fetch } = {}
): Promise<NoaaTidesOutcome> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const cacheKey = `${stationId}:${format(date, "yyyy-MM-dd")}`;

  try {
    const cached = await getOrFetchCached(client, "noaa_tides", cacheKey, CACHE_TTL_SECONDS, () =>
      fetchNoaaTides(stationId, date, fetchImpl)
    );
    return {
      source: "noaa_tides",
      available: true,
      data: cached.data,
      fetchedAt: cached.fetchedAt,
      fromCache: cached.fromCache,
    };
  } catch (error) {
    console.error(`[noaa_tides] station ${stationId} unavailable: ${error}`);
    return { source: "noaa_tides", available: false, data: null, fetchedAt: null, fromCache: false };
  }
}
