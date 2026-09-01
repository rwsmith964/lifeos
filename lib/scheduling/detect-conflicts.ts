// Module 4 — async orchestration for detectTravelTimeConflicts: fetches a
// household's events in range, reuses computeTravelLegs (lib/brief/prep.ts)
// to build ordered from->to legs, resolves each leg's minutes (preferring
// each event's already-cached travel_time_before_minutes — written by the
// brief generator — over a fresh API call, since this is a separate
// read-only pass that may run more often than the daily brief and shouldn't
// multiply external API calls), then hands off to the pure comparison in
// travel-conflicts.ts. Read-only end to end: never writes anything.
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeTravelLegs, type LatLng } from "../brief/prep";
import { getTravelTime } from "../external/travel";
import { listEventsInRange } from "../db/repositories/calendar";
import {
  detectTravelTimeConflicts,
  type LocatedTimedEvent,
  type TravelConflictWarning,
  type TravelMinutesLookup,
} from "./travel-conflicts";

export interface DetectScheduleConflictsOptions {
  googleMapsApiKey?: string;
  mapboxAccessToken?: string;
}

/**
 * Runs the read-only travel-time conflict pass for one household over
 * [startsAtISO, endsAtISO). `home` is the fallback "previous location" for
 * the day's first located event (same semantics as computeTravelLegs).
 */
export async function detectScheduleConflictsForHousehold(
  client: SupabaseClient,
  householdId: string,
  startsAtISO: string,
  endsAtISO: string,
  home: LatLng,
  options: DetectScheduleConflictsOptions = {}
): Promise<TravelConflictWarning[]> {
  const events = await listEventsInRange(client, householdId, startsAtISO, endsAtISO);

  const located: LocatedTimedEvent[] = events.map((e) => ({
    id: e.id,
    title: e.title,
    startsAt: new Date(e.starts_at),
    endsAt: new Date(e.ends_at),
    locationLat: e.location_lat,
    locationLng: e.location_lng,
  }));

  const legs = computeTravelLegs(
    located.map((e) => ({
      id: e.id,
      startsAt: e.startsAt,
      locationLat: e.locationLat,
      locationLng: e.locationLng,
    })),
    home
  );

  const cachedMinutesByEventId = new Map(
    events.filter((e) => e.travel_time_before_minutes != null).map((e) => [e.id, e.travel_time_before_minutes!])
  );

  const travelMinutesByEventId = new Map<string, TravelMinutesLookup>();
  for (const leg of legs) {
    const cached = cachedMinutesByEventId.get(leg.eventId);
    if (cached != null) {
      travelMinutesByEventId.set(leg.eventId, { leg, minutes: cached, source: "cached" });
      continue;
    }
    const result = await getTravelTime(leg.from, leg.to, {
      googleMapsApiKey: options.googleMapsApiKey,
      mapboxAccessToken: options.mapboxAccessToken,
    });
    travelMinutesByEventId.set(leg.eventId, { leg, minutes: result.minutes, source: result.source });
  }

  return detectTravelTimeConflicts(located, travelMinutesByEventId);
}
