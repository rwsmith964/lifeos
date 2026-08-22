// Travel time (Section 8.5). Google Maps Distance Matrix or Mapbox Matrix
// API when a key is configured; a haversine-distance fallback (x1.4 road
// factor, /45mph) when neither is — so the system works with zero API keys
// (Section 12.9). Logs which source is active on every call.
export type TravelTimeSource = "google" | "mapbox" | "haversine_fallback";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface TravelTimeResult {
  minutes: number;
  source: TravelTimeSource;
}

const EARTH_RADIUS_MILES = 3958.8;
const ROAD_FACTOR = 1.4;
const ASSUMED_MPH = 45;

/** Great-circle distance in miles between two lat/lng points. */
export function haversineMiles(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_MILES * c;
}

export function haversineTravelTimeMinutes(origin: LatLng, destination: LatLng): number {
  const straightLineMiles = haversineMiles(origin, destination);
  const roadMiles = straightLineMiles * ROAD_FACTOR;
  const hours = roadMiles / ASSUMED_MPH;
  return Math.round(hours * 60);
}

interface GoogleDistanceMatrixResponse {
  rows: { elements: { status: string; duration?: { value: number } }[] }[];
}

async function fetchGoogleTravelTimeMinutes(
  origin: LatLng,
  destination: LatLng,
  apiKey: string,
  fetchImpl: typeof fetch
): Promise<number | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("origins", `${origin.lat},${origin.lng}`);
  url.searchParams.set("destinations", `${destination.lat},${destination.lng}`);
  url.searchParams.set("key", apiKey);

  const res = await fetchImpl(url.toString());
  if (!res.ok) return null;
  const body = (await res.json()) as GoogleDistanceMatrixResponse;
  const element = body.rows[0]?.elements[0];
  if (!element || element.status !== "OK" || !element.duration) return null;
  return Math.round(element.duration.value / 60);
}

interface MapboxMatrixResponse {
  durations: number[][];
  code: string;
}

async function fetchMapboxTravelTimeMinutes(
  origin: LatLng,
  destination: LatLng,
  accessToken: string,
  fetchImpl: typeof fetch
): Promise<number | null> {
  const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url = new URL(`https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coords}`);
  url.searchParams.set("access_token", accessToken);

  const res = await fetchImpl(url.toString());
  if (!res.ok) return null;
  const body = (await res.json()) as MapboxMatrixResponse;
  if (body.code !== "Ok") return null;
  const seconds = body.durations[0]?.[1];
  if (seconds == null) return null;
  return Math.round(seconds / 60);
}

export interface GetTravelTimeOptions {
  googleMapsApiKey?: string;
  mapboxAccessToken?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Resolves travel time in this order: Google Maps (if key present) ->
 * Mapbox (if token present) -> haversine fallback. Never throws — a failed
 * network call for a configured provider still falls through to the next
 * tier rather than propagating, since travel time is an estimate feeding a
 * scheduling suggestion, not a correctness-critical value.
 */
export async function getTravelTime(
  origin: LatLng,
  destination: LatLng,
  options: GetTravelTimeOptions = {}
): Promise<TravelTimeResult> {
  const fetchImpl = options.fetchImpl ?? fetch;

  if (options.googleMapsApiKey) {
    try {
      const minutes = await fetchGoogleTravelTimeMinutes(
        origin,
        destination,
        options.googleMapsApiKey,
        fetchImpl
      );
      if (minutes != null) return { minutes, source: "google" };
    } catch {
      // fall through to the next tier
    }
  }

  if (options.mapboxAccessToken) {
    try {
      const minutes = await fetchMapboxTravelTimeMinutes(
        origin,
        destination,
        options.mapboxAccessToken,
        fetchImpl
      );
      if (minutes != null) return { minutes, source: "mapbox" };
    } catch {
      // fall through to the fallback
    }
  }

  return { minutes: haversineTravelTimeMinutes(origin, destination), source: "haversine_fallback" };
}
