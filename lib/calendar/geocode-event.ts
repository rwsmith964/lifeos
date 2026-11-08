// Gives an event's free-text location map coordinates so drive-time
// suggestions can work. Best-effort: a failed or empty lookup just leaves the
// event without coordinates (no travel suggestion), and never fails a save.
import { geocodeAddress } from "../external/geocode";

export interface EventCoordinates {
  lat: number;
  lng: number;
}

export async function coordinatesForLocation(location: string | null | undefined): Promise<EventCoordinates | null> {
  const trimmed = location?.trim();
  if (!trimmed) return null;
  try {
    const outcome = await geocodeAddress(trimmed);
    return outcome.status === "ok" ? { lat: outcome.result.lat, lng: outcome.result.lng } : null;
  } catch {
    return null;
  }
}
