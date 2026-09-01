// Module 4 — travel-time-aware conflict detection (read-only warnings only,
// per the brief's additive rule: "conflict detection produces warnings only.
// No auto-rescheduling in v1"). Pure functions, DB-free by design, same split
// as lib/brief/prep.ts (pure leg/obligation math) + lib/external/travel.ts
// (async minutes lookup) — computeTravelLegs from prep.ts is reused as-is
// (brief: "verify and extend rather than rewrite") to build the ordered
// from->to pairs; this file adds the actual conflict *comparison*: does the
// gap between two chronologically adjacent, geographically located events
// leave enough time to actually drive between them?
import type { LatLng, TravelLeg } from "../brief/prep";

export interface LocatedTimedEvent {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  locationLat: number | null;
  locationLng: number | null;
}

export interface TravelConflictWarning {
  fromEventId: string;
  fromEventTitle: string;
  toEventId: string;
  toEventTitle: string;
  /** Minutes actually available between the two events (can be negative for a literal overlap). */
  availableMinutes: number;
  /** Minutes the drive is estimated to take. */
  requiredMinutes: number;
  /** How far short the available window falls, in minutes. Always > 0 for a returned warning. */
  shortfallMinutes: number;
  travelTimeSource: "google" | "mapbox" | "haversine_fallback" | "cached";
}

export interface TravelMinutesLookup {
  leg: TravelLeg;
  minutes: number;
  source: "google" | "mapbox" | "haversine_fallback" | "cached";
}

/**
 * Given a household's chronologically ordered located events and the
 * already-resolved travel time for each leg between them (the caller
 * resolves each leg via lib/external/travel.ts, reusing a cached
 * travel_time_before_minutes value when present to avoid duplicate lookups),
 * flags every adjacent pair where the gap between "previous event ends" and
 * "next event starts" is smaller than the estimated drive time. This is
 * deliberately about *adjacent* events sharing an implied travel leg — not
 * every possible pair — since a travel-time conflict is inherently about
 * consecutive commitments, matching how computeTravelLegs (prep.ts) already
 * builds legs from previous-location to next-location in order.
 *
 * Never mutates anything; returns warnings only.
 */
export function detectTravelTimeConflicts(
  events: LocatedTimedEvent[],
  travelMinutesByEventId: Map<string, TravelMinutesLookup>
): TravelConflictWarning[] {
  const sorted = [...events]
    .filter((e) => e.locationLat != null && e.locationLng != null)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const warnings: TravelConflictWarning[] = [];

  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1];
    const next = sorted[i];
    const lookup = travelMinutesByEventId.get(next.id);
    if (!lookup) continue; // no resolved travel time for this leg — nothing to compare

    const availableMinutes = (next.startsAt.getTime() - previous.endsAt.getTime()) / 60_000;
    const shortfallMinutes = lookup.minutes - availableMinutes;
    if (shortfallMinutes <= 0) continue; // there's enough time (or the events don't even touch)

    warnings.push({
      fromEventId: previous.id,
      fromEventTitle: previous.title,
      toEventId: next.id,
      toEventTitle: next.title,
      availableMinutes: Math.round(availableMinutes),
      requiredMinutes: lookup.minutes,
      shortfallMinutes: Math.round(shortfallMinutes),
      travelTimeSource: lookup.source,
    });
  }

  return warnings;
}

/** Re-exported for callers that only need the LatLng shape without importing brief/prep directly. */
export type { LatLng };
