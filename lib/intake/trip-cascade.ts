// R-1 (D-142): itinerary-aware trip planning cascade. Given an approved
// "flight" intake draft's extracted fields, computes the pre-trip
// schedule (TSA cutoff -> drive time -> leave-by -> pack-by) and cross-
// references accepted childcare coverage for the travel window -- see
// ROADMAP-PROACTIVE-ASSISTANT.md R-1's "rough shape of the work" list.
//
// Every derived time is deterministic arithmetic over the flight's own
// stated departure time; nothing in this file calls the AI. Drive time
// reuses the exact adapter chain (Google Distance Matrix -> Mapbox ->
// haversine fallback) that childcare-actions.ts already established for
// the same "text address -> geocode -> drive minutes" problem, so a
// household with zero mapping API keys configured still gets a usable
// (if rougher) estimate rather than nothing.
//
// This module never writes anything -- lib/intake/convert.ts is the only
// caller, and it turns this module's output into new intake_drafts rows
// (status='needs_review'), never a direct calendar_events write, per the
// Additive Contract's "drafts not writes where relevant."
import type { SupabaseClient } from "@supabase/supabase-js";
import { addMinutes, format, subMinutes } from "date-fns";
import { geocodeAddress } from "../external/geocode";
import { getTravelTime, type LatLng, type TravelTimeSource } from "../external/travel";
import { listChildcareRequestsForHousehold } from "../db/repositories/childcare";
import type { PersonRow } from "../db/database.types";

/**
 * Default minutes before a domestic flight's stated departure time that
 * a traveler should be through security, used whenever a household hasn't
 * set its own `households.tsa_buffer_minutes` override (QUEUE-041, closed
 * by that column + convert.ts passing it through to computeTripCascade).
 */
export const DEFAULT_TSA_BUFFER_MINUTES = 120;

/** How long before "leave for the airport" the pack reminder fires. */
export const DEFAULT_PACK_LEAD_MINUTES = 12 * 60;

export interface FlightFields {
  departureAirport: string;
  departureAt: Date;
}

export interface DerivedCascadeEvent {
  title: string;
  startsAt: Date;
  endsAt: Date;
  /** 0-1 confidence for this derived event's timing -- high when computed
   * from the flight's own stated time and a real drive-time lookup, lower
   * when a fallback had to be used, so the review queue's existing
   * confidence surfacing (lib/intake/labels.ts, the review card) is
   * honest about which derived times are solid vs. a rough guess. */
  confidence: number;
  /** Plain-language explanation of how this time was computed -- becomes
   * the derived draft's source_excerpt, never a raw ISO timestamp or enum
   * (standing ground rule). */
  note: string;
}

export interface TripCascadeResult {
  tsaCutoffAt: Date;
  leaveByAt: Date | null;
  packByAt: Date;
  driveMinutes: number | null;
  driveTimeSource: TravelTimeSource | null;
  events: DerivedCascadeEvent[];
}

/**
 * Computes the derived pre-trip schedule for one flight leg. `home` is
 * the traveler's own geocoded home coordinates (null when not on file --
 * Settings > home address, the same field childcare-actions.ts reads via
 * usersRepo.getById(...).home_lat/home_lng). Never throws: every external
 * lookup (geocoding the airport, fetching drive time) degrades to a
 * documented fallback rather than failing the whole cascade, since every
 * event this produces is a review-queue draft a human still approves, not
 * a silent write -- a missing drive-time estimate should skip the "leave
 * for the airport" event rather than block the whole flow.
 */
export async function computeTripCascade(
  flight: FlightFields,
  home: LatLng | null,
  options: { tsaBufferMinutes?: number; packLeadMinutes?: number } = {}
): Promise<TripCascadeResult> {
  const tsaBufferMinutes = options.tsaBufferMinutes ?? DEFAULT_TSA_BUFFER_MINUTES;
  const packLeadMinutes = options.packLeadMinutes ?? DEFAULT_PACK_LEAD_MINUTES;

  const tsaCutoffAt = subMinutes(flight.departureAt, tsaBufferMinutes);

  let driveMinutes: number | null = null;
  let driveTimeSource: TravelTimeSource | null = null;
  if (home) {
    try {
      const geocoded = await geocodeAddress(flight.departureAirport);
      if (geocoded.status === "ok") {
        const travel = await getTravelTime(home, { lat: geocoded.result.lat, lng: geocoded.result.lng });
        driveMinutes = travel.minutes;
        driveTimeSource = travel.source;
      }
    } catch {
      // Geocoding/travel-time are best-effort here -- fall through with
      // driveMinutes left null rather than failing the whole cascade.
    }
  }

  const events: DerivedCascadeEvent[] = [];
  let leaveByAt: Date | null = null;

  if (driveMinutes != null) {
    leaveByAt = subMinutes(tsaCutoffAt, driveMinutes);
    events.push({
      title: `Leave for ${flight.departureAirport}`,
      startsAt: leaveByAt,
      endsAt: addMinutes(leaveByAt, 15),
      confidence: driveTimeSource === "haversine_fallback" ? 0.6 : 0.9,
      note:
        driveTimeSource === "haversine_fallback"
          ? `Rough straight-line drive-time estimate to ${flight.departureAirport} (about ${driveMinutes} min) -- no mapping API configured, so treat this as approximate.`
          : `About ${driveMinutes} min drive to ${flight.departureAirport}, timed to arrive by the security-line cutoff.`,
    });
  }

  events.push({
    title: `Arrive at ${flight.departureAirport} (security cutoff)`,
    startsAt: tsaCutoffAt,
    endsAt: addMinutes(tsaCutoffAt, 15),
    confidence: 0.85,
    note: `${tsaBufferMinutes} minutes before the flight's stated departure time -- a common domestic-flight buffer. Adjust if this is international or the airport tends to run slower.`,
  });

  const packByAt = subMinutes(leaveByAt ?? tsaCutoffAt, packLeadMinutes);
  events.push({
    title: "Pack for the trip",
    startsAt: packByAt,
    endsAt: addMinutes(packByAt, 30),
    confidence: 0.7,
    note: "Reminder timed ahead of departure so packing doesn't get squeezed out -- see the packing checklist wizard for a per-trip list.",
  });

  events.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  return { tsaCutoffAt, leaveByAt, packByAt, driveMinutes, driveTimeSource, events };
}

export interface ChildcareCoverageSummary {
  hasAcceptedCoverage: boolean;
  /** One human-readable line per accepted request overlapping the travel
   * window, e.g. "Grandma covers Cal & Emlyn on Fri, Sep 12." Never a raw
   * ISO date (standing ground rule) -- dates are pre-formatted here. */
  summaries: string[];
}

function personLabel(person: PersonRow | undefined): string {
  if (!person) return "Someone not in this household";
  return person.nickname || person.full_name;
}

/**
 * Cross-references accepted childcare_requests against a trip's date
 * range -- "check whether the kids have an accepted childcare request and
 * who/where they'll be" per the roadmap. Only 'accepted' requests count;
 * pending/declined/expired ones aren't coverage. Overlap is by calendar
 * date (childcare_requests.care_date is a single date per request, not a
 * range) against the flight's own departure date through the later of the
 * flight's return leg (if known) or just the departure date itself when
 * no return is on file yet.
 */
export async function summarizeChildcareCoverage(
  supabase: SupabaseClient,
  householdId: string,
  tripStartDate: Date,
  tripEndDate: Date,
  peopleById: Map<string, PersonRow>
): Promise<ChildcareCoverageSummary> {
  const requests = await listChildcareRequestsForHousehold(supabase, householdId);
  const startKey = format(tripStartDate, "yyyy-MM-dd");
  const endKey = format(tripEndDate, "yyyy-MM-dd");

  const overlapping = requests.filter(
    (r) => r.status === "accepted" && r.care_date >= startKey && r.care_date <= endKey
  );

  const summaries = overlapping.map((r) => {
    const provider = personLabel(peopleById.get(r.provider_person_id));
    const children = r.child_person_ids.map((id) => personLabel(peopleById.get(id))).join(" & ");
    const dateLabel = format(new Date(`${r.care_date}T00:00:00`), "EEE, MMM d");
    return children
      ? `${provider} covers ${children} on ${dateLabel}.`
      : `${provider} has accepted childcare coverage on ${dateLabel}.`;
  });

  return { hasAcceptedCoverage: overlapping.length > 0, summaries };
}
