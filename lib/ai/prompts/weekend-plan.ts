// Weekend planner feature prompt (Section 9). The scoring function makes
// the recommendation (lib/planner/scoring.ts); this prompt only narrates
// the already-scored candidates and layers in the companion angle
// (Section 9.5) — the AI is never asked to invent a score or a condition.
import { z } from "zod";
import { BASE_SYSTEM_PROMPT } from "./base";

export const WEEKEND_PLAN_SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}

You are narrating a weekend activity recommendation. You will be given a list of candidate activities, each with a score already computed by a deterministic scoring function (0-100) and the underlying weather/condition data and travel feasibility that produced it. You do NOT compute or adjust the score — narrate what's already there.

Rules specific to this task:
- Every claim about weather or conditions must come from the data you were given. If a candidate's condition data says "not available," say plainly that no current report exists for it — never imply a condition you weren't told.
- If the top candidate's score is low (below 50) or no candidate scores well, say so plainly and pivot to whichever candidate is comparatively best, explaining why in terms of the actual data (Section 9.6 — "no strong fishing conditions this weekend... weather's clear and 68 degrees Saturday, which is good golf weather").
- If a candidate has an overdue companion listed, weave that into the recommendation explicitly (e.g. "...and Mike's overdue for a round").
- A plan that always finds something great is not believable. It is fine, and expected sometimes, for the recommendation to be lukewarm.

Return ONLY a single JSON object with exactly this shape (no prose, no markdown fences):
{
  "headline": string,
  "recommendation": { "activityType": string, "locationName": string | null, "reasoning": string, "whoToInvite": string[] } | null,
  "alternates": [{ "activityType": string, "note": string }]
}
Set "recommendation" to null only if literally every candidate is infeasible (e.g. travel time alone exceeds every available block).`;

export const weekendPlanAiResponseSchema = z.object({
  headline: z.string().min(1),
  recommendation: z
    .object({
      activityType: z.string().min(1),
      locationName: z.string().nullable(),
      reasoning: z.string().min(1),
      whoToInvite: z.array(z.string()),
    })
    .nullable(),
  alternates: z.array(z.object({ activityType: z.string().min(1), note: z.string().min(1) })),
});

export type WeekendPlanAiResponse = z.infer<typeof weekendPlanAiResponseSchema>;

export interface ScoredActivityContext {
  activityType: string;
  locationName: string | null;
  score: number;
  weatherSummary: string | null;
  conditionSummary: string | null; // null/"" -> AI must say "not available", never guess
  travelMinutesEachWay: number | null;
  overdueCompanionLabels: string[];
}

export interface WeekendPlanContextInput {
  weekendDateLabel: string;
  scoredActivities: ScoredActivityContext[]; // pre-sorted best first by the caller
}

export function buildWeekendPlanUserPrompt(ctx: WeekendPlanContextInput): string {
  const lines: string[] = [];
  lines.push(`Weekend: ${ctx.weekendDateLabel}`);
  lines.push("", "Candidate activities, best-scored first:");

  if (ctx.scoredActivities.length === 0) {
    lines.push("(no candidate activities available this weekend)");
  } else {
    for (const activity of ctx.scoredActivities) {
      lines.push(`- ${activity.activityType}${activity.locationName ? ` at ${activity.locationName}` : ""}: score ${activity.score}/100`);
      lines.push(`  weather: ${activity.weatherSummary ?? "not available"}`);
      lines.push(`  conditions: ${activity.conditionSummary ?? "not available"}`);
      if (activity.travelMinutesEachWay != null) {
        lines.push(`  travel: ${activity.travelMinutesEachWay} min each way`);
      }
      if (activity.overdueCompanionLabels.length > 0) {
        lines.push(`  overdue companions: ${activity.overdueCompanionLabels.join(", ")}`);
      }
    }
  }

  return lines.join("\n");
}
