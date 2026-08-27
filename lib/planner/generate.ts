// Weekend planner orchestration (Section 9). Fetches activities/locations,
// resolves weather/condition/travel data through the external adapters,
// scores every candidate with the deterministic scoring function, then asks
// the AI to narrate the already-scored result (never to invent the score).
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, format, setHours, startOfDay } from "date-fns";
import { AiBudgetExceededError, AiUnavailableError, callAi } from "../ai/client";
import { buildChildTokenMap, type ChildTokenMap } from "../ai/context";
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
import { listPeopleForHousehold, peopleRepo } from "../db/repositories/people";
import { getWeekendPlanForDate, weekendPlansRepo } from "../db/repositories/system";
import { getNoaaTidePredictions } from "../external/noaa-tides";
import { getNwsForecast } from "../external/nws";
import { getOdfwReport } from "../external/odfw";
import { computeSolunarPeriods } from "../external/solunar";
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

  // Section 6.5 / docs/privacy.md: any person handed to the AI prompt goes
  // through the child-token map first, same as the brief and gift engines —
  // a preferred_companion CAN be a child (e.g. a parent's own kid listed as
  // a fishing buddy), so this can't skip the redaction just because
  // "companions" sounds adult-only.
  const householdPeople = await listPeopleForHousehold(client, householdId);
  const tokenMap = buildChildTokenMap(householdPeople);

  const scored: (ScoredActivityContext & { totalScore: number; activityId: string })[] = [];

  for (const activity of activities) {
    const location = activity.locations[0];
    const point = location?.lat != null && location.lng != null ? { lat: location.lat, lng: location.lng } : home;

    const [forecast, travel, usgs, odfw, tides] = await Promise.all([
      getNwsForecast(client, point.lat, point.lng),
      getTravelTime(home, point, {}),
      location?.external_ids?.usgs_gauge
        ? getUsgsGaugeReading(client, location.external_ids.usgs_gauge)
        : Promise.resolve(null),
      location?.external_ids?.odfw_zone_url
        ? getOdfwReport(client, location.external_ids.odfw_zone_url)
        : Promise.resolve(null),
      location?.external_ids?.noaa_station
        ? getNoaaTidePredictions(client, location.external_ids.noaa_station, saturday)
        : Promise.resolve(null),
    ]);
    // Solunar is a pure local computation (no external call needed), but
    // major/minor "feeding periods" are only meaningful for fishing/hunting
    // — surfacing them on a golf or gym recommendation would just be
    // confusing noise the AI has no reason to mention. Gate it on the same
    // signal as USGS/ODFW: a location configured with fishing-relevant
    // external_ids.
    const isFishingRelevantLocation = Boolean(
      location?.external_ids?.usgs_gauge || location?.external_ids?.odfw_zone_url
    );
    const solunar = isFishingRelevantLocation ? computeSolunarPeriods(saturday, point.lat, point.lng) : null;

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
    const overdueCompanionLabels = await labelPeople(
      client,
      overdueCompanions.map((c) => c.personId),
      tokenMap
    );

    const result = scoreActivity({
      weatherSuitabilityScore: weatherScore,
      conditionDataScore,
      travelFeasibilityScore: travelScore,
      enjoymentRank: activity.enjoyment_rank,
      weeksSinceLastProposed,
    });

    const conditionParts: string[] = [];
    if (usgs?.data) {
      conditionParts.push(`flow ${usgs.data.flowCfs ?? "?"} cfs, gauge height ${usgs.data.gaugeHeightFt ?? "?"} ft`);
    }
    if (odfw?.data) {
      // The scraped page can run to thousands of characters (see
      // MAX_REPORT_TEXT_LENGTH in lib/external/odfw.ts) — trim what goes
      // into the AI prompt so one activity's condition data doesn't
      // dominate token usage across the whole weekend-plan call.
      const ODFW_PROMPT_EXCERPT_LENGTH = 400;
      conditionParts.push(`ODFW report: ${odfw.data.reportText.slice(0, ODFW_PROMPT_EXCERPT_LENGTH)}`);
    }
    if (tides?.data && tides.data.predictions.length > 0) {
      const tideSummary = tides.data.predictions
        .map((p) => `${p.type} ${p.heightFt}ft at ${p.time}`)
        .join(", ");
      conditionParts.push(`Tides: ${tideSummary}`);
    }
    const majorSolunarPeriods = solunar?.periods
      .filter((p) => p.type === "major")
      .map((p) => `${format(p.start, "h:mm a")}-${format(p.end, "h:mm a")}`)
      .join(", ");
    if (majorSolunarPeriods) {
      conditionParts.push(`Solunar major feeding periods: ${majorSolunarPeriods}`);
    }

    scored.push({
      activityId: activity.id,
      activityType: activity.activity_type,
      locationName: location?.name ?? null,
      score: result.totalScore,
      totalScore: result.totalScore,
      weatherSummary: todayPeriod?.shortForecast ?? null,
      conditionSummary: conditionParts.length > 0 ? conditionParts.join(" | ") : null,
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
    if (error instanceof AiUnavailableError) {
      console.error("Weekend plan unavailable:", error.message);
      return {
        status: "ai_unavailable",
        reason: "Weekend planning is temporarily unavailable. Try again in a few minutes.",
      };
    }
    if (error instanceof AiBudgetExceededError) {
      return { status: "budget_exceeded", reason: "Today's AI budget for this household has been reached — try again tomorrow." };
    }
    throw error;
  }

  // overdueCompanionLabels were tokenized before being handed to the AI
  // (or, on the template-fallback path, never left this process at all) —
  // either way, restore real names before rendering/storing so CHILD_N
  // never surfaces in the UI.
  const rawContent: WeekendPlanAiResponse = aiResponse ?? buildTemplatedWeekendPlan(scored);
  const content: WeekendPlanAiResponse = JSON.parse(tokenMap.restoreRealNames(JSON.stringify(rawContent)));
  const markdown = renderWeekendPlanMarkdown(content);

  // Previously this only wrote a row when none existed yet for the date,
  // which meant a manual "regenerate" trigger (e.g. after adding a new
  // activity) silently recomputed a plan in memory but never persisted or
  // displayed it — the UI only ever reads back whatever's stored via
  // getWeekendPlanForDate. Always upsert now so a rerun genuinely
  // regenerates the visible plan, matching the brief's regenerate
  // behavior (D-057).
  const existing = await getWeekendPlanForDate(client, householdId, forDate);
  const planFields = {
    content_json: content,
    content_markdown: markdown,
    model_version: aiResponse ? AI_MODEL : "template-fallback",
  };
  if (existing) {
    await weekendPlansRepo.update(client, existing.id, planFields);
  } else {
    await weekendPlansRepo.create(client, {
      household_id: householdId,
      for_date: forDate,
      ...planFields,
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

async function labelPeople(client: SupabaseClient, personIds: string[], tokenMap: ChildTokenMap): Promise<string[]> {
  if (personIds.length === 0) return [];
  const labels: string[] = [];
  for (const id of personIds) {
    const person = await peopleRepo.getById(client, id);
    if (person) labels.push(tokenMap.labelFor(person));
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
