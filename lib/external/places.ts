// Google Places API (New) adapter (QUEUE-043: "suggest nearby locations for
// an activity" feature request). Uses Text Search
// (https://places.googleapis.com/v1/places:searchText) rather than Nearby
// Search because activity_type on user_activities is free text chosen by
// the household (e.g. "Golf", "Rock climbing", "Fishing") and Nearby
// Search only accepts Google's fixed ~200-value place-type enum — Text
// Search takes a free-text query directly and biases toward a location,
// which fits this data model without a type-mapping table to maintain.
//
// Same graceful-degrade shape as the other lib/external adapters
// (geocode.ts, usgs.ts): no key configured -> available: false, never
// throws. Only ever called from an explicit "Find nearby" button click
// (not a hot/repeated path like weather/tide), so no caching layer here,
// matching geocode.ts's reasoning.

export interface PlaceSuggestion {
  placeId: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  userRatingCount: number | null;
}

export type PlacesSearchOutcome =
  | { available: true; places: PlaceSuggestion[] }
  | { available: false; places: []; reason: "not_configured" | "error"; message?: string };

interface PlacesTextSearchResponse {
  places?: {
    id: string;
    displayName?: { text: string };
    formattedAddress?: string;
    location?: { latitude: number; longitude: number };
    rating?: number;
    userRatingCount?: number;
  }[];
}

export async function searchNearbyPlaces(
  query: string,
  center: { lat: number; lng: number },
  options: {
    radiusMeters?: number;
    maxResults?: number;
    fetchImpl?: typeof fetch;
    // Defaults to process.env.GOOGLE_PLACES_API_KEY -- overridable so tests
    // don't depend on process.env at module-load time (same pattern as
    // travel.ts's getTravelTime(..., { googleMapsApiKey })).
    apiKey?: string;
  } = {}
): Promise<PlacesSearchOutcome> {
  const apiKey = options.apiKey ?? process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return { available: false, places: [], reason: "not_configured" };
  }
  const trimmed = query.trim();
  if (!trimmed) {
    return { available: false, places: [], reason: "error", message: "A search term is required." };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const radiusMeters = options.radiusMeters ?? 40_000; // ~25 miles, a reasonable default drive radius
  const maxResultCount = Math.min(Math.max(options.maxResults ?? 8, 1), 20);

  try {
    const res = await fetchImpl("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount",
      },
      body: JSON.stringify({
        textQuery: trimmed,
        maxResultCount,
        locationBias: {
          circle: {
            center: { latitude: center.lat, longitude: center.lng },
            radius: radiusMeters,
          },
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[places] searchText failed: HTTP ${res.status} ${body}`);
      return { available: false, places: [], reason: "error", message: `Location search failed (HTTP ${res.status}).` };
    }

    const body = (await res.json()) as PlacesTextSearchResponse;
    const places: PlaceSuggestion[] = (body.places ?? []).map((p) => ({
      placeId: p.id,
      name: p.displayName?.text ?? "Unnamed place",
      address: p.formattedAddress ?? null,
      lat: p.location?.latitude ?? null,
      lng: p.location?.longitude ?? null,
      rating: p.rating ?? null,
      userRatingCount: p.userRatingCount ?? null,
    }));
    return { available: true, places };
  } catch (error) {
    console.error(`[places] searchText error: ${error}`);
    return {
      available: false,
      places: [],
      reason: "error",
      message: error instanceof Error ? error.message : "Unknown error searching for places.",
    };
  }
}
