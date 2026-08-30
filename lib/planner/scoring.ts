// Activity scoring aggregation (Section 9.4) — the function that makes the
// recommendation, not the AI. "The AI narrates the recommendation; the
// scoring function makes it." Pure and unit-tested.
import { SCORING_WEIGHTS, type ScoringComponent } from "./weights";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface ActivityScoreInputs {
  weatherSuitabilityScore: number; // 0-100, lib/planner/weather-score.ts
  /** null when no condition data (river flow/tide/solunar) applies to this activity type. */
  conditionDataScore: number | null;
  travelFeasibilityScore: number; // 0-100, lib/planner/travel-score.ts
  enjoymentRank: number; // 1-10, from user_activities.enjoyment_rank
  /** Weeks since this activity was last proposed by the planner; null = not recently. */
  weeksSinceLastProposed: number | null;
  /** D-083 (P3-1): weeks since this activity was actually last done (user_activities.last_done_at); null/undefined = no record, or not recently. A real completion is a stronger recency signal than merely having been proposed, so this and weeksSinceLastProposed are combined (most-recent wins) before the penalty curve is applied. Optional so existing callers/tests that only care about the proposed-recency signal don't need updating. */
  weeksSinceLastDone?: number | null;
}

export interface ActivityScoreResult {
  totalScore: number; // 0-100
  breakdown: Record<ScoringComponent, number>; // each component's WEIGHTED contribution, sums to totalScore
}

const NEUTRAL_CONDITION_SCORE = 50;

/** No penalty at 3+ weeks; increasingly strong penalty proposing again sooner
 * ("don't propose golf three weekends running", Section 9.4). */
function recencyPenaltyScore(weeksSinceLastProposed: number | null): number {
  if (weeksSinceLastProposed == null || weeksSinceLastProposed >= 3) return 100;
  if (weeksSinceLastProposed === 2) return 80;
  if (weeksSinceLastProposed === 1) return 40;
  return 20; // proposed this same weekend
}

/** Combines the two recency signals by taking whichever is more recent (smaller) -- either one alone is reason enough to ease off proposing the same thing again straight away. */
function combinedWeeksSinceRecent(
  weeksSinceLastProposed: number | null,
  weeksSinceLastDone: number | null | undefined
): number | null {
  if (weeksSinceLastProposed == null) return weeksSinceLastDone ?? null;
  if (weeksSinceLastDone == null) return weeksSinceLastProposed;
  return Math.min(weeksSinceLastProposed, weeksSinceLastDone);
}

export function scoreActivity(inputs: ActivityScoreInputs): ActivityScoreResult {
  const componentScores: Record<ScoringComponent, number> = {
    weatherSuitability: clamp(inputs.weatherSuitabilityScore, 0, 100),
    conditionData: clamp(inputs.conditionDataScore ?? NEUTRAL_CONDITION_SCORE, 0, 100),
    travelFeasibility: clamp(inputs.travelFeasibilityScore, 0, 100),
    enjoymentFit: clamp((inputs.enjoymentRank / 10) * 100, 0, 100),
    recencyPenalty: recencyPenaltyScore(
      combinedWeeksSinceRecent(inputs.weeksSinceLastProposed, inputs.weeksSinceLastDone)
    ),
  };

  const breakdown = Object.fromEntries(
    (Object.keys(SCORING_WEIGHTS) as ScoringComponent[]).map((component) => [
      component,
      componentScores[component] * SCORING_WEIGHTS[component],
    ])
  ) as Record<ScoringComponent, number>;

  const totalScore = clamp(
    Math.round(Object.values(breakdown).reduce((sum, v) => sum + v, 0)),
    0,
    100
  );

  return { totalScore, breakdown };
}
