// D-070 (P1-7): resolves the best available drive-time estimate for an
// activity/location pair, and used by both the opportunity detector and the
// weekend planner (see score-candidate.ts) so both surfaces get the same
// number.
//
// The bug this exists to fix: every opportunity card said "about 0 min
// drive each way," for real locations with names (Fiddlers Green, Creswell
// Clay Target Sports, Magpie Cafe...). The old code did
// `location?.lat != null ? {lat,lng} : home` and then called
// getTravelTime(home, point) -- when a location has no lat/lng (true for
// every activity_location in this household; the activity form only ever
// exposed raw numeric lat/lng inputs, which nobody fills in by hand), point
// silently became `home`, and the haversine distance from home to itself
// is 0. That's a routing bug, not a missing-data problem -- "no
// coordinates" was being read as "co-located with home" instead of
// "unknown."
//
// Fix: only call the real routing/haversine service when we actually have
// distinct coordinates. When we don't, fall back to a manually-entered
// drive-time estimate (per-location `drive_time_minutes`, then the
// activity's own `typical_drive_minutes` -- exactly the field the
// Activities page already shows, e.g. Fishing's "45 min typical, up to 90
// for a big trip"). Only when neither exists do we report "unknown" --
// callers must render that as an omission, never as a false "0 min."
import type { ActivityLocationRow, UserActivityRow } from "../db/database.types";
import { getTravelTime, type LatLng, type TravelTimeSource } from "../external/travel";

export type TravelEstimateSource = TravelTimeSource | "activity_typical_estimate" | "unknown";

export interface TravelEstimate {
  /** Point used for weather/forecast lookups. Real location coords when known, else home. */
  point: LatLng;
  /** Estimated one-way drive minutes, or null when we have no basis to estimate at all. */
  minutes: number | null;
  source: TravelEstimateSource;
}

/**
 * Prefers a location that actually has coordinates over one that doesn't,
 * for activities with more than one location on file (e.g. Shooting has
 * both Izaak Walton League and Creswell Clay Target Sports) -- otherwise
 * an arbitrary `locations[0]` ordering could pick the location we can't
 * route to over one we can.
 */
export function pickBestLocation(locations: ActivityLocationRow[]): ActivityLocationRow | null {
  if (locations.length === 0) return null;
  const withCoords = locations.find((l) => l.lat != null && l.lng != null);
  return withCoords ?? locations[0];
}

export async function resolveTravelEstimate(
  home: LatLng,
  location: ActivityLocationRow | null,
  activity: Pick<UserActivityRow, "typical_drive_minutes">
): Promise<TravelEstimate> {
  if (location?.lat != null && location.lng != null) {
    const point = { lat: location.lat, lng: location.lng };
    const travel = await getTravelTime(home, point, {});
    return { point, minutes: travel.minutes, source: travel.source };
  }
  if (location?.drive_time_minutes != null) {
    return { point: home, minutes: location.drive_time_minutes, source: "activity_typical_estimate" };
  }
  if (activity.typical_drive_minutes != null) {
    return { point: home, minutes: activity.typical_drive_minutes, source: "activity_typical_estimate" };
  }
  return { point: home, minutes: null, source: "unknown" };
}

/** Human-readable drive-time clause for reasoning text -- never asserts a number we don't have. */
export function formatTravelClause(estimate: TravelEstimate): string {
  if (estimate.minutes == null) return "";
  if (estimate.source === "activity_typical_estimate") {
    return ` and an estimated ${estimate.minutes} min drive each way (based on this activity's typical drive time)`;
  }
  return ` and about ${estimate.minutes} min drive each way`;
}
