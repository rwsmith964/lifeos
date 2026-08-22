// USGS Water Services adapter (Section 9.2) — river/stream gauge height,
// flow, water temp. Free, no key, keyed by gauge ID from
// activity_locations.external_ids.usgs_gauge. Cached 1 hour (instantaneous
// values update every 15-60 min upstream).
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrFetchCached } from "./cache";

const CACHE_TTL_SECONDS = 60 * 60;

// USGS parameter codes (https://help.waterdata.usgs.gov/parameter_cd).
const PARAM_DISCHARGE_CFS = "00060";
const PARAM_GAUGE_HEIGHT_FT = "00065";
const PARAM_WATER_TEMP_C = "00010";

export interface UsgsGaugeData {
  gaugeId: string;
  observedAt: string | null;
  flowCfs: number | null;
  gaugeHeightFt: number | null;
  waterTempC: number | null;
}

export interface UsgsGaugeOutcome {
  source: "usgs";
  available: boolean;
  data: UsgsGaugeData | null;
  fetchedAt: string | null;
  fromCache: boolean;
}

interface UsgsTimeSeries {
  variable: { variableCode: { value: string }[] };
  values: { value: { value: string; dateTime: string }[] }[];
}

interface UsgsResponse {
  value: { timeSeries: UsgsTimeSeries[] };
}

function latestValue(series: UsgsTimeSeries[], paramCode: string): { value: number; dateTime: string } | null {
  const match = series.find((s) => s.variable.variableCode[0]?.value === paramCode);
  const point = match?.values[0]?.value[0];
  if (!point) return null;
  const parsed = Number(point.value);
  if (Number.isNaN(parsed)) return null;
  return { value: parsed, dateTime: point.dateTime };
}

async function fetchUsgsGauge(gaugeId: string, fetchImpl: typeof fetch): Promise<UsgsGaugeData> {
  const url = new URL("https://waterservices.usgs.gov/nwis/iv/");
  url.searchParams.set("sites", gaugeId);
  url.searchParams.set("format", "json");
  url.searchParams.set("parameterCd", [PARAM_DISCHARGE_CFS, PARAM_GAUGE_HEIGHT_FT, PARAM_WATER_TEMP_C].join(","));

  const res = await fetchImpl(url.toString());
  if (!res.ok) throw new Error(`USGS gauge fetch failed: HTTP ${res.status}`);
  const body = (await res.json()) as UsgsResponse;
  const series = body.value.timeSeries;

  const discharge = latestValue(series, PARAM_DISCHARGE_CFS);
  const height = latestValue(series, PARAM_GAUGE_HEIGHT_FT);
  const temp = latestValue(series, PARAM_WATER_TEMP_C);

  return {
    gaugeId,
    observedAt: discharge?.dateTime ?? height?.dateTime ?? temp?.dateTime ?? null,
    flowCfs: discharge?.value ?? null,
    gaugeHeightFt: height?.value ?? null,
    waterTempC: temp?.value ?? null,
  };
}

export async function getUsgsGaugeReading(
  client: SupabaseClient,
  gaugeId: string,
  options: { fetchImpl?: typeof fetch } = {}
): Promise<UsgsGaugeOutcome> {
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const cached = await getOrFetchCached(client, "usgs", gaugeId, CACHE_TTL_SECONDS, () =>
      fetchUsgsGauge(gaugeId, fetchImpl)
    );
    return { source: "usgs", available: true, data: cached.data, fetchedAt: cached.fetchedAt, fromCache: cached.fromCache };
  } catch (error) {
    console.error(`[usgs] gauge ${gaugeId} unavailable: ${error}`);
    return { source: "usgs", available: false, data: null, fetchedAt: null, fromCache: false };
  }
}
