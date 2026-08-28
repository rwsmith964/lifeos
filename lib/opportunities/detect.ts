// D-061: opportunity detection engine. For every active activity and every
// open trip idea, scans a bounded window of upcoming days looking for a day
// that is BOTH exceptionally good weather AND has enough open calendar time
// to actually do the thing -- the two gates the clarifying spec called for
// ("exceptionally high weather-suitability scores gated by available open-
// block time"). Writes a row per (household, activity|trip idea, date) the
// first time it clears the bar; never re-detects a day it already scored,
// dismissed or not (see the unique indexes in the opportunities migration).
//
// Deliberately reuses scoreWeatherSuitability() as the only scoring signal
// rather than inventing a new condition-data (river/tide/solunar) threshold
// -- lib/planner/generate.ts leaves conditionDataScore null pending
// validated domain data (D-020), and that constraint carries forward here:
// an "opportunity" is a weather-window signal, not a full 5-factor
// recommendation (that's still the weekend planner's job).
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, format, setHours, startOfDay } from "date-fns";
import { findOpenBlocks, largestOpenBlock } from "../planner/available-blocks";
import { scoreTravelFeasibility } from "../planner/travel-score";
import { parseWindMph, scoreWeatherSuitability } from "../planner/weather-score";
import { listActivitiesWithLocations } from "../db/repositories/activities";
import { listCustodyBlocksForHouseholdInRange, listEventsInRange } from "../db/repositories/calendar";
import { householdsRepo, usersRepo } from "../db/repositories/households";
import {
  findExistingActivityOpportunity,
  findExistingTripIdeaOpportunity,
  opportunitiesRepo,
} from "../db/repositories/opportunities";
import { listPeopleForHousehold, peopleRepo } from "../db/repositories/people";
import { listTripIdeasForHousehold } from "../db/repositories/trip-ideas";
import { getNwsForecast, type NwsForecastPeriod } from "../external/nws";
import { getTravelTime } from "../external/travel";
import { dispatchNotification } from "../notifications/dispatch";

// NWS's forecast endpoint only returns ~7 days of periods (day+night) --
// scanning further than that would mean scoring days with no real forecast
// signal, which is exactly the kind of fabricated-data shortcut D-020
// already ruled out for condition data. Bounding the scan to what the
// adapter can actually answer keeps every detected opportunity backed by a
// real forecast.
export const OPPORTUNITY_SCAN_DAYS_AHEAD = 7;
export const ACTIVITY_WEATHER_SCORE_THRESHOLD = 85;
export const TRIP_IDEA_WEATHER_SCORE_THRESHOLD = 70;
export const TRIP_IDEA_MIN_OPEN_BLOCK_MINUTES = 6 * 60;
const WAKING_HOUR_START = 8;
const WAKING_HOUR_END = 20;

export interface DetectOpportunitiesResult {
  opportunitiesDetected: number;
  notificationSent: boolean;
}

export async function detectOpportunitiesForHousehold(
  client: SupabaseClient,
  householdId: string,
  today: Date = new Date()
): Promise<DetectOpportunitiesResult> {
  const household = await householdsRepo.getById(client, householdId);
  if (!household) throw new Error(`Household ${householdId} not found`);

  const owner = await findHouseholdOwnerUser(client, householdId);
  const home = owner?.home_lat != null && owner?.home_lng != null ? { lat: owner.home_lat, lng: owner.home_lng } : null;
  // No anchor point means no way to score travel feasibility or fetch a
  // fallback forecast for trip ideas -- same precondition generateWeekendPlan
  // requires before it will produce candidates.
  if (!home) return { opportunitiesDetected: 0, notificationSent: false };

  const [activities, tripIdeas] = await Promise.all([
    listActivitiesWithLocations(client, householdId),
    listTripIdeasForHousehold(client, householdId),
  ]);
  const openTripIdeas = tripIdeas.filter((t) => t.status === "idea" || t.status === "planned");
  if (activities.length === 0 && openTripIdeas.length === 0) {
    return { opportunitiesDetected: 0, notificationSent: false };
  }

  const scanStart = startOfDay(today);
  const scanEnd = addDays(scanStart, OPPORTUNITY_SCAN_DAYS_AHEAD);

  const [events, custodyBlocks] = await Promise.all([
    listEventsInRange(client, householdId, scanStart.toISOString(), scanEnd.toISOString()),
    listCustodyBlocksForHouseholdInRange(client, householdId, scanStart.toISOString(), scanEnd.toISOString()),
  ]);
  const busyPeriods = [
    ...events.map((e) => ({ start: new Date(e.starts_at), end: new Date(e.ends_at) })),
    ...custodyBlocks.map((c) => ({ start: new Date(c.starts_at), end: new Date(c.ends_at) })),
  ];

  const newHeadlines: string[] = [];

  for (let i = 0; i < OPPORTUNITY_SCAN_DAYS_AHEAD; i++) {
    const dayStart = addDays(scanStart, i);
    const forDateStr = format(dayStart, "yyyy-MM-dd");
    const expiresAt = addDays(dayStart, 1).toISOString();

    const openBlocks = findOpenBlocks(setHours(dayStart, WAKING_HOUR_START), setHours(dayStart, WAKING_HOUR_END), busyPeriods);
    const bestBlock = largestOpenBlock(openBlocks);
    const availableMinutes = bestBlock?.durationMinutes ?? 0;
    if (availableMinutes <= 0) continue;

    for (const activity of activities) {
      if (availableMinutes < activity.typical_duration_minutes) continue;

      const existing = await findExistingActivityOpportunity(client, householdId, activity.id, forDateStr);
      if (existing) continue;

      const location = activity.locations[0];
      const point = location?.lat != null && location.lng != null ? { lat: location.lat, lng: location.lng } : home;

      const forecast = await getNwsForecast(client, point.lat, point.lng);
      const period = bestDaytimePeriodForDate(forecast.data?.periods ?? [], dayStart);
      if (!period) continue; // beyond the forecast horizon, or the adapter has no data right now

      const weatherScore = scoreWeatherSuitability({
        tempF: period.temperatureF,
        precipChancePercent: period.precipitationChancePercent,
        windMph: parseWindMph(period.windSpeed),
      });
      if (weatherScore < ACTIVITY_WEATHER_SCORE_THRESHOLD) continue;

      const travel = await getTravelTime(home, point, {});
      const travelScore = scoreTravelFeasibility(travel.minutes, availableMinutes);
      if (travelScore <= 0) continue; // round-trip travel alone would eat the whole open block

      const dayOfWeekLabel = format(dayStart, "EEEE");
      const headline = `Exceptional ${activity.activity_type} weather ${dayOfWeekLabel}`;
      const reasoning = `${period.shortForecast} on ${format(dayStart, "EEEE, MMM d")} (weather score ${weatherScore}/100) with a ${formatHours(availableMinutes)} open block${location?.name ? ` near ${location.name}` : ""} and about ${travel.minutes} min drive each way.`;

      await opportunitiesRepo.create(client, {
        household_id: householdId,
        activity_id: activity.id,
        trip_idea_id: null,
        opportunity_type: "activity_window",
        for_date: forDateStr,
        score: weatherScore,
        headline,
        reasoning,
        expires_at: expiresAt,
      });
      newHeadlines.push(headline);
    }

    for (const tripIdea of openTripIdeas) {
      if (availableMinutes < TRIP_IDEA_MIN_OPEN_BLOCK_MINUTES) continue;

      const existing = await findExistingTripIdeaOpportunity(client, householdId, tripIdea.id, forDateStr);
      if (existing) continue;

      // Trip ideas (D-059) deliberately carry no location of their own --
      // title/timeframe/companions only -- so home is the only sensible
      // forecast anchor, the same assumption the daily brief's weather
      // section already makes.
      const forecast = await getNwsForecast(client, home.lat, home.lng);
      const period = bestDaytimePeriodForDate(forecast.data?.periods ?? [], dayStart);
      if (!period) continue;

      const weatherScore = scoreWeatherSuitability({
        tempF: period.temperatureF,
        precipChancePercent: period.precipitationChancePercent,
        windMph: parseWindMph(period.windSpeed),
      });
      if (weatherScore < TRIP_IDEA_WEATHER_SCORE_THRESHOLD) continue;

      const dayOfWeekLabel = format(dayStart, "EEEE");
      const headline = `Big open block for “${tripIdea.title}” ${dayOfWeekLabel}`;
      const reasoning = `${period.shortForecast} on ${format(dayStart, "EEEE, MMM d")} (weather score ${weatherScore}/100) with about ${formatHours(availableMinutes)} free — long enough for “${tripIdea.title}”.`;

      await opportunitiesRepo.create(client, {
        household_id: householdId,
        activity_id: null,
        trip_idea_id: tripIdea.id,
        opportunity_type: "trip_idea_window",
        for_date: forDateStr,
        score: weatherScore,
        headline,
        reasoning,
        expires_at: expiresAt,
      });
      newHeadlines.push(headline);
    }
  }

  let notificationSent = false;
  if (newHeadlines.length > 0) {
    const people = await listPeopleForHousehold(client, householdId);
    const self = people.find((p) => p.relationship_type === "self");
    if (self) {
      const title =
        newHeadlines.length === 1 ? newHeadlines[0] : `${newHeadlines.length} new opportunities detected`;
      const body =
        newHeadlines.length === 1
          ? newHeadlines[0]
          : newHeadlines.map((h) => `\u2022 ${h}`).join("\n");
      await dispatchNotification(
        client,
        {
          householdId,
          personId: self.id,
          notificationType: "opportunity_detected",
          title,
          body,
          linkPath: "/opportunities",
        },
        ["in_app", "email"]
      );
      notificationSent = true;
    }
  }

  return { opportunitiesDetected: newHeadlines.length, notificationSent };
}

function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return hours === Math.round(hours) ? `${hours}-hour` : `${hours.toFixed(1)}-hour`;
}

/**
 * NWS forecast periods aren't indexed by day -- each is a ~12hr day/night
 * span (startTime/endTime, ISO with offset) -- so for a given target date
 * there are usually two candidate periods (the daytime one and the
 * overnight one straddling midnight). Picks whichever period overlaps the
 * most of that date's waking hours (8am-8pm), and returns null if none of
 * the returned periods cover the date at all (i.e. it's beyond the
 * forecast horizon, or the adapter had no data).
 */
export function bestDaytimePeriodForDate(periods: NwsForecastPeriod[], targetDate: Date): NwsForecastPeriod | null {
  const wakingStart = setHours(startOfDay(targetDate), WAKING_HOUR_START).getTime();
  const wakingEnd = setHours(startOfDay(targetDate), WAKING_HOUR_END).getTime();

  let best: { period: NwsForecastPeriod; overlapMs: number } | null = null;
  for (const period of periods) {
    const start = new Date(period.startTime).getTime();
    const end = new Date(period.endTime).getTime();
    const overlapMs = Math.min(end, wakingEnd) - Math.max(start, wakingStart);
    if (overlapMs <= 0) continue;
    if (!best || overlapMs > best.overlapMs) best = { period, overlapMs };
  }
  return best?.period ?? null;
}

async function findHouseholdOwnerUser(client: SupabaseClient, householdId: string) {
  const people = await peopleRepo.list(client, (q) =>
    q.eq("household_id", householdId).eq("relationship_type", "self").limit(1)
  );
  const self = people[0];
  if (!self?.user_id) return null;
  return usersRepo.getById(client, self.user_id);
}
