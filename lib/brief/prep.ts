// Prep and travel-time derivation (Section 8.5 — "the thing that makes it
// real"). Pure functions; the async travel-time lookup and DB writes live
// in lib/brief/generate.ts, which calls these with already-fetched data.
import { subHours } from "date-fns";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface TimedEvent {
  id: string;
  startsAt: Date;
  locationLat: number | null;
  locationLng: number | null;
}

export interface TravelLeg {
  eventId: string;
  from: LatLng;
  to: LatLng;
}

/**
 * For each event in chronological order, determines the location to
 * compute travel time FROM: the previous event's location if it had one,
 * otherwise home. Events with no location of their own are skipped (there's
 * nowhere to travel to). Returns one leg per event that needs a travel-time
 * lookup — the caller resolves each leg's minutes via lib/external/travel.ts
 * and writes calendar_events.travel_time_before_minutes.
 */
export function computeTravelLegs(events: TimedEvent[], home: LatLng): TravelLeg[] {
  const sorted = [...events].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const legs: TravelLeg[] = [];

  let previousLocation: LatLng = home;
  for (const event of sorted) {
    if (event.locationLat == null || event.locationLng == null) {
      // No location on this event — nothing to travel to; it doesn't reset
      // "previous location" either, since the next real location should
      // still measure from wherever the day last placed you.
      continue;
    }
    const to: LatLng = { lat: event.locationLat, lng: event.locationLng };
    legs.push({ eventId: event.id, from: previousLocation, to });
    previousLocation = to;
  }

  return legs;
}

export interface PrepObligation {
  activityId: string;
  eventId: string;
  eventStartsAt: Date;
  prepAt: Date;
}

export interface ActivityForPrep {
  id: string;
  requiresPrep: boolean;
  prepLeadTimeHours: number | null;
}

export interface EventForPrep {
  id: string;
  startsAt: Date;
  relatedActivityId: string | null;
}

/**
 * One obligation per event whose linked activity requires prep. `prepAt` is
 * when the reminder/prep event should be scheduled — Friday evening for a
 * Saturday morning trip with a 12-hour lead time, per the spec's example.
 */
export function computePrepObligations(
  events: EventForPrep[],
  activitiesById: Map<string, ActivityForPrep>
): PrepObligation[] {
  const obligations: PrepObligation[] = [];
  for (const event of events) {
    if (!event.relatedActivityId) continue;
    const activity = activitiesById.get(event.relatedActivityId);
    if (!activity || !activity.requiresPrep || activity.prepLeadTimeHours == null) continue;
    obligations.push({
      activityId: activity.id,
      eventId: event.id,
      eventStartsAt: event.startsAt,
      prepAt: subHours(event.startsAt, activity.prepLeadTimeHours),
    });
  }
  return obligations;
}
