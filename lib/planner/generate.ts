// Weekend planner orchestration (Section 9). Fetches activities/locations,
// resolves weather/condition/travel data through the external adapters,
// scores every candidate with the deterministic scoring function, then asks
// the AI to narrate the already-scored result (never to invent the score).
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, format, setHours, startOfDay } from "date-fns";
import { AiBudgetExceededError, AiUnavailableError, callAi } from "../ai/client";
import { parseAiJson } from "../ai/parse-json";
import { AI_MODEL } from "../ai/pricing";
import {
  WEEKEND_PLAN_SYSTEM_PROMPT,
  buildWeekendPlanUserPrompt,
  weekendPlanAiResponseSchema,
  type ScoredActivityContext,
  type WeekendPlanAiResponse,
} from "../ai/prompts/weekend-plan";
import { listActivitiesWithLocations } from "../db/repositories/activities";
import { listCustodyBlocksForHouseholdInRange, listEventsInRange } from "../db/repositories/calendar";
import { listActiveCadencesForHousehold } from "../db/repositories/contact";
import { householdsRepo, usersRepo } from "../db/repositories/households";
import { peopleRepo } from "../db/repositories/people";
import { getWeekendPlanForDate, weekendPlansRepo } from "../db/repositories/system";
import { getNwsForecast } from "../external/nws";
import { getTravelTime } from "../external/travel";
import { getUsgsGaugeReading } from "../external/usgs";
import { findOpenBlocks, largestOpenBlock } from "./available-blocks";
import { findOverdueCompanions } from "./companions";
import { scoreActivity } from "./scoring";
import { scoreTravelFeasibility } from "./travel-score";
import { scoreWeatherSuitability } from "./weather-score";

const WAKING_HOUR_START = 8;
const WAKING_HOUR_END = 20;
const RECENCY_LOOKBACK_WEEKS = 4;

export type GenerateWeekendPlanResult =
  | { status: "generated"; contentMarkdown: string }
  | { status: "ai_unavailable"; reason: string }
  | { status: "budget_exceeded"; reason: string }
  | { status: "no_candidates" };

function nextSaturdayFrom(today: Date): Date {
  const daysUntilSaturday = (6 - today.getDay() + 7) % 7;
  return startOfDay(addDays(today, daysUntilSaturday === 0 ? 7 : daysUntilSaturday));
}

export async function generateWeekendPlan(
  client: SupabaseClient,
  householdId: string,
  today: Date = new Date()
): Promise<GenerateWeekendPlanResult> {
  const household = await householdsRepo.getById(client, householdId);
  if (!household) throw new Error(`Household ${householdId} not found`);

  const saturday = nextSaturdayFrom(today);
  const sunday = addDays(saturday, 1);
  const forDate = format(saturday, "yyyy-MM-dd");

  const owner = await findHouseholdOwnerUser(client, householdId);
  const home = owner?.home_lat != null && owner?.home_lng != null ? { lat: owner.home_lat, lng: owner.home_lng } : null;

  const activities = await listActivitiesWithLocations(client, householdId);
  if (activities.length === 0 || !home) {
    return { status: "no_candidates" };
  }

  const windowStart = setHours(saturday, WAKING_HOUR_START);
  const windowEnd = setHours(sunday, WAKING_HOUR_END);

  const [events, custodyBlocks, cadenceRows, recentPlans] = await Promise.all([
    listEventsInRange(client, householdId, windowStart.toISOString(), windowEnd.toISOString()),
    listCustodyBlocksForHouseholdInRange(client, householdId, windowStart.toISOString(), windowEnd.toISOString()),
    listActiveCadencesForHousehold(client, householdId),
    listRecentWeekendPlans(client, householdId, today),
  ]);

  const busyPeriods = [
    ...events.map((e) => ({ start: new Date(e.starts_at), end: new Date(e.ends_at) })),
    ...custodyBlocks.map((c) => ({ start: new Date(c.starts_at), end: new Date(c.ends_at) })),
  ];
  const openBlocks = findOpenBlocks(windowStart, windowEnd, busyPeriods);
  const bestBlock = largestOpenBlock(openBlocks);
  const availableMinutes = bestBlock?.durationMinutes ?? 0;

  const cadenceByPersonId = new Map(cadenceRows.map((c) => [c.person_id, c]));
  const recentActivityTypes = recentPlans.map((p) => p.activityType);

  const scored: (ScoredActivityContext & { totalScore: number; activityId: string })[] = [];

  for (const activity of activities) {
    const location = activity.locations[0];
    const point = location?.lat != null && location.lng != null ? { lat: location.lat, lng: location.lng } : home;

    const [forecast, travel, usgs] = await Promise.all([
      getNwsForecast(client, point.lat, point.lng),
      getTravelTime(home, point, {}),
      location?.external_ids?.usgs_gauge
        ? getUsgsGaugeReading(client, location.external_ids.usgs_gauge)
        : Promise.resolve(null),
    ]);

    const todayPeriod = forecast.data?.periods[0] ?? null;
    const weatherScore = scoreWeatherSuitability({
      tempF: todayPeriod?.temperatureF ?? null,
      precipChancePercent: todayPeriod?.precipitationChancePercent ?? null,
      windMph: todayPeriod ? parseWindMph(todayPeriod.windSpeed) : null,
    });

    const travelMinutes = travel.minutes;
    const travelScore = scoreTravelFeasibility(travelMinutes, availableMinutes);

    // Condition-data scoring (river flow/tide/solunar) needs validated
    // domain thresholds this build doesn't have — see DECISIONS.md D-020.
    // Left neutral (null) rather than fabricating a "good range."
    const conditionDataScore: number | null = null;

    const weeksSinceLastProposed = recentActivityTypes.includes(activity.activity_type)
      ? recentActivityTypes.lastIndexOf(activity.activity_type) // index doubles as a rough recency proxy
      : null;

    const overdueCompanions = findOverdueCompanions(activity.preferred_companions, cadenceByPersonId, today);
    const overdueCompanionLabels = await labelPeople(client, overdueCompanions.map((c) => c.personId));

    const result = scoreActivity({
      weatherSuitabilityScore: weatherScore,
      conditionDataScore,
      travelFeasibilityScore: travelScore,
      enjoymentRank: activity.enjoyment_rank,
      weeksSinceLastProposed,
    });

    scored.push({
      activityId: activity.id,
      activityType: activity.activity_type,
      locationName: location?.name ?? null,
      score: result.totalScore,
      totalScore: result.totalScore,
      weatherSummary: todayPeriod?.shortForecast ?? null,
      conditionSummary: usgs?.data
        ? `flow ${usgs.data.flowCfs ?? "?"} cfs, gauge height ${usgs.data.gaugeHeightFt ?? "?"} ft`
        : null,
      travelMinutesEachWay: travelMinutes,
      overdueCompanionLabels,
    });
  }

  scored.sort((a, b) => b.totalScore - a.totalScore);

  const userPrompt = buildWeekendPlanUserPrompt({
    weekendDateLabel: `${format(saturday, "EEEE, MMM d")} - ${format(sunday, "EEEE, MMM d")}`,
    scoredActivities: scored,
  });

  let aiResponse: WeekendPlanAiResponse | null = null;
  try {
    const result = await callAi(client, {
      householdId,
      feature: "weekend_plan",
      systemPrompt: WEEKEND_PLAN_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 1024,
    });
    const parsed = parseAiJson(result.text);
    if (parsed.success) {
      const validated = weekendPlanAiResponseSchema.safeParse(parsed.data);
      if (validated.success) aiResponse = validated.data;
    }
  } catch (error) {
    if (error instanceof AiUnavailableError) return { status: "ai_unavailable", reason: error.message };
    if (error instanceof AiBudgetExceededError) return { status: "budget_exceeded", reason: error.message };
    throw error;
  }

  const content: WeekendPlanAiResponse = aiResponse ?? buildTemplatedWeekendPlan(scored);
  const markdown = renderWeekendPlanMarkdown(content);

  const existing = await getWeekendPlanForDate(client, householdId, forDate);
  if (!existing) {
    await weekendPlansRepo.create(client, {
      household_id: householdId,
      for_date: forDate,
      content_json: content,
      content_markdown: markdown,
      model_version: aiResponse ? AI_MODEL : "template-fallback",
    });
  }

  return { status: "generated", contentMarkdown: markdown };
}

function parseWindMph(windSpeed: string): number | null {
  const match = /(\d+)/.exec(windSpeed);
  return match ? Number(match[1]) : null;
}

async function findHouseholdOwnerUser(client: SupabaseClient, householdId: string) {
  const people = await peopleRepo.list(client, (q) =>
    q.eq("household_id", householdId).eq("relationship_type", "self").limit(1)
  );
  const self = people[0];
  if (!self?.user_id) return null;
  return usersRepo.getById(client, self.user_id);
}

async function labelPeople(client: SupabaseClient, personIds: string[]): Promise<string[]> {
  if (personIds.length === 0) return [];
  const labels: string[] = [];
  for (const id of personIds) {
    const person = await peopleRepo.getById(client, id);
    if (person) labels.push(person.full_name);
  }
  return labels;
}

interface RecentPlanSummary {
  activityType: string;
}

async function listRecentWeekendPlans(
  client: SupabaseClient,
  householdId: string,
  today: Date
): Promise<RecentPlanSummary[]> {
  const summaries: RecentPlanSummary[] = [];
  for (let i = 1; i <= RECENCY_LOOKBACK_WEEKS; i++) {
    const saturday = format(addDays(nextSaturdayFrom(today), -7 * i), "yyyy-MM-dd");
    const plan = await getWeekendPlanForDate(client, householdId, saturday);
    const content = plan?.content_json as WeekendPlanAiResponse | undefined;
    if (content?.recommendation) summaries.push({ activityType: content.recommendation.activityType });
  }
  return summaries;
}

function buildTemplatedWeekendPlan(
  scored: (ScoredActivityContext & { totalScore: number })[]
): WeekendPlanAiResponse {
  const best = scored[0];
  if (!best) {
    return { headline: "No activities configured yet.", recommendation: null, alternates: [] };
  }
  return {
    headline: `${best.activityType} scores highest this weekend (${best.totalScore}/100).`,
    recommendation: {
      activityType: best.activityType,
      locationName: best.locationName,
      reasoning: `Weather: ${best.weatherSummary ?? "not available"}. Conditions: ${best.conditionSummary ?? "not available"}.`,
      whoToInvite: best.overdueCompanionLabels,
    },
    alternates: scored.slice(1, 3).map((s) => ({ activityType: s.activityType, note: `Score: ${s.totalScore}/100` })),
  };
}

function renderWeekendPlanMarkdown(content: WeekendPlanAiResponse): string {
  const lines: string[] = [`## ${content.headline}`];
  if (content.recommendation) {
    const r = content.recommendation;
    lines.push("", `**Recommendation:** ${r.activityType}${r.locationName ? ` at ${r.locationName}` : ""}`);
    lines.push(r.reasoning);
    if (r.whoToInvite.length > 0) lines.push(`Invite: ${r.whoToInvite.join(", ")}`);
  }
  if (content.alternates.length > 0) {
    lines.push("", "**Alternates:**");
    for (const alt of content.alternates) lines.push(`- ${alt.activityType}: ${alt.note}`);
  }
  return lines.join("\n");
}
