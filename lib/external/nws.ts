// National Weather Service adapter (Section 9.2) — free, no API key, US
// only, the primary weather source. Two-step lookup: /points/{lat},{lng}
// resolves the forecast office grid URL, then that URL returns periods.
// Cached 1 hour (NWS forecasts update a few times a day, not continuously).
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrFetchCached } from "./cache";

const NWS_USER_AGENT = process.env.NWS_USER_AGENT ?? "LifeOS/1.0 (personal use, self-hosted)";
const CACHE_TTL_SECONDS = 60 * 60;

export interface NwsForecastPeriod {
  name: string;
  startTime: string;
  endTime: string;
  temperatureF: number;
  windSpeed: string;
  shortForecast: string;
  precipitationChancePercent: number | null;
}

export interface NwsForecastData {
  periods: NwsForecastPeriod[];
}

export interface NwsForecastOutcome {
  source: "nws";
  available: boolean;
  data: NwsForecastData | null;
  fetchedAt: string | null;
  fromCache: boolean;
}

interface NwsPointsResponse {
  properties: { forecast: string };
}

interface NwsForecastResponse {
  properties: {
    periods: {
      name: string;
      startTime: string;
      endTime: string;
      temperature: number;
      windSpeed: string;
      shortForecast: string;
      probabilityOfPrecipitation?: { value: number | null };
    }[];
  };
}

async function fetchNwsForecast(lat: number, lng: number, fetchImpl: typeof fetch): Promise<NwsForecastData> {
  const headers = { "User-Agent": NWS_USER_AGENT, Accept: "application/geo+json" };

  const pointsRes = await fetchImpl(
    `https://api.weather.gov/points/${lat.toFixed(4)},${lng.toFixed(4)}`,
    { headers }
  );
  if (!pointsRes.ok) throw new Error(`NWS points lookup failed: HTTP ${pointsRes.status}`);
  const points = (await pointsRes.json()) as NwsPointsResponse;

  const forecastRes = await fetchImpl(points.properties.forecast, { headers });
  if (!forecastRes.ok) throw new Error(`NWS forecast fetch failed: HTTP ${forecastRes.status}`);
  const forecast = (await forecastRes.json()) as NwsForecastResponse;

  return {
    periods: forecast.properties.periods.map((p) => ({
      name: p.name,
      startTime: p.startTime,
      endTime: p.endTime,
      temperatureF: p.temperature,
      windSpeed: p.windSpeed,
      shortForecast: p.shortForecast,
      precipitationChancePercent: p.probabilityOfPrecipitation?.value ?? null,
    })),
  };
}

export async function getNwsForecast(
  client: SupabaseClient,
  lat: number,
  lng: number,
  options: { fetchImpl?: typeof fetch } = {}
): Promise<NwsForecastOutcome> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const cacheKey = `${lat.toFixed(2)},${lng.toFixed(2)}`;

  try {
    const cached = await getOrFetchCached(client, "nws", cacheKey, CACHE_TTL_SECONDS, () =>
      fetchNwsForecast(lat, lng, fetchImpl)
    );
    return { source: "nws", available: true, data: cached.data, fetchedAt: cached.fetchedAt, fromCache: cached.fromCache };
  } catch (error) {
    console.error(`[nws] forecast unavailable for ${cacheKey}: ${error}`);
    return { source: "nws", available: false, data: null, fetchedAt: null, fromCache: false };
  }
}
