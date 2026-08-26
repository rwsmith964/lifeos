// Forward-geocoding adapter: turns a free-text home address into
// lat/lng. Uses OpenStreetMap's Nominatim (nominatim.openstreetmap.org) —
// free, no API key required, which avoids the custom-credentials flow
// entirely for this backlog item. Only ever called once per settings save
// (a direct user action), never on a hot/repeated path, so no caching
// layer is needed here unlike the weather/tide/gauge adapters in this
// same directory that get hit on every plan/brief generation.
//
// Nominatim's usage policy (https://operations.osmfoundation.org/policies/nominatim/)
// requires a descriptive User-Agent and caps unauthenticated use at 1
// request/second — both trivially satisfied by a single-household app
// where this only fires on an explicit "Save settings" click.

const NOMINATIM_USER_AGENT = process.env.NOMINATIM_USER_AGENT ?? "LifeOS/1.0 (personal use, self-hosted)";

export interface GeocodeResult {
  lat: number;
  lng: number;
  /** Nominatim's own normalized/display form of the matched address. */
  displayName: string;
}

export type GeocodeOutcome =
  | { status: "ok"; result: GeocodeResult }
  | { status: "not_found" }
  | { status: "error"; message: string };

interface NominatimSearchResult {
  lat: string;
  lon: string;
  display_name: string;
}

export async function geocodeAddress(
  address: string,
  options: { fetchImpl?: typeof fetch } = {}
): Promise<GeocodeOutcome> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const trimmed = address.trim();
  if (!trimmed) return { status: "not_found" };

  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(trimmed)}`;

  try {
    const res = await fetchImpl(url, {
      headers: { "User-Agent": NOMINATIM_USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) {
      return { status: "error", message: `Nominatim lookup failed: HTTP ${res.status}` };
    }
    const results = (await res.json()) as NominatimSearchResult[];
    const first = results[0];
    if (!first) return { status: "not_found" };

    const lat = Number.parseFloat(first.lat);
    const lng = Number.parseFloat(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { status: "error", message: "Nominatim returned coordinates we couldn't parse." };
    }
    return { status: "ok", result: { lat, lng, displayName: first.display_name } };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unknown geocoding error." };
  }
}
