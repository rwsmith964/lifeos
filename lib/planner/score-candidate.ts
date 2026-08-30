// D-070 (P1-8): the one scoring function both the opportunity detector
// (lib/opportunities/detect.ts) and the weekend planner
// (lib/planner/generate.ts) call for "how good is this activity, on this
// day, given this household's calendar and location." Before this, each
// surface computed its own version -- Opportunities used raw weather score
// only; the weekend plan ran the full 5-factor scoreActivity() blend. Same
// activity, same day, two different numbers. Now there is exactly one
// scoring path; both surfaces feed it the same inputs and get the same
// output.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivityLocationRow, UserActivityRow } from "../db/database.types";
import type { LatLng } from "../external/travel";
import { getNwsForecast, type NwsForecastPeriod } from "../external/nws";
import { bestForecastPeriodForDate } from "./forecast-period";
import { resolveTravelEstimate, type TravelEstimate } from "./travel-estimate";
import { scoreActivity, type ActivityScoreResult } from "./scoring";
import { scoreTravelFeasibility } from "./travel-score";
import { parseWindMph, scoreWeatherSuitability } from "./weather-score";

const NEUTRAL_TRAVEL_SCORE = 50; // parallels scoring.ts's NEUTRAL_CONDITION_SCORE — no penalty/bonus when drive time is genuinely unknown

export interface ScoreActivityCandidateInput {
  activity: Pick<UserActivityRow, "enjoyment_rank" | "typical_drive_minutes">;
  location: ActivityLocationRow | null;
  home: LatLng;
  targetDate: Date;
  availableMinutes: number;
  weeksSinceLastProposed: number | null;
  weeksSinceLastDone?: number | null;
}

export interface ScoreActivityCandidateResult {
  score: ActivityScoreResult;
  weatherScore: number;
  forecastPeriod: NwsForecastPeriod | null;
  travel: TravelEstimate;
}

export async function scoreActivityCandidate(
  client: SupabaseClient,
  input: ScoreActivityCandidateInput
): Promise<ScoreActivityCandidateResult> {
  const travel = await resolveTravelEstimate(input.home, input.location, input.activity);
  const forecast = await getNwsForecast(client, travel.point.lat, travel.point.lng);
  const forecastPeriod = bestForecastPeriodForDate(forecast.data?.periods ?? [], input.targetDate);

  const weatherScore = scoreWeatherSuitability({
    tempF: forecastPeriod?.temperatureF ?? null,
    precipChancePercent: forecastPeriod?.precipitationChancePercent ?? null,
    windMph: forecastPeriod ? parseWindMph(forecastPeriod.windSpeed) : null,
  });

  const travelScore =
    travel.minutes != null ? scoreTravelFeasibility(travel.minutes, input.availableMinutes) : NEUTRAL_TRAVEL_SCORE;

  const score = scoreActivity({
    weatherSuitabilityScore: weatherScore,
    conditionDataScore: null,
    travelFeasibilityScore: travelScore,
    enjoymentRank: input.activity.enjoyment_rank,
    weeksSinceLastProposed: input.weeksSinceLastProposed,
    weeksSinceLastDone: input.weeksSinceLastDone,
  });

  return { score, weatherScore, forecastPeriod, travel };
}
