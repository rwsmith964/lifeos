// Module 2 (leisure_planner_v2, D-118): turns an ActivityScoreResult's
// breakdown (lib/planner/scoring.ts) into the labeled, display-ready shape
// the inventory's Q2 finding said a user should be able to see instead of
// a bare "87/100" -- and decides whether an opportunity row should persist
// its breakdown at all. Pure, DB-free, fully unit-tested; the AI narrator
// and any UI stay untouched by this file.
import type { ScoringComponent } from "./weights";

/** Ground-rule-compliant labels -- no raw enum/camelCase keys shown to a
 * user. Order matches the weight table in lib/planner/weights.ts so a
 * rendered list reads weather -> conditions -> travel -> enjoyment -> recency. */
export const SCORE_COMPONENT_LABELS: Record<ScoringComponent, string> = {
  weatherSuitability: "Weather",
  conditionData: "Conditions",
  travelFeasibility: "Travel",
  enjoymentFit: "Enjoyment fit",
  recencyPenalty: "Recency",
};

export interface DisplayScoreComponent {
  key: ScoringComponent;
  label: string;
  /** Weighted contribution to the total (breakdown value), rounded to one decimal for display. */
  points: number;
}

/** Ordered, labeled breakdown for display -- e.g. a card's expandable
 * "why this score" row. Order is the fixed component order above, not
 * insertion order of the input object, so display is stable regardless of
 * how the breakdown record was constructed. */
export function formatScoreBreakdownForDisplay(
  breakdown: Record<ScoringComponent, number>
): DisplayScoreComponent[] {
  return (Object.keys(SCORE_COMPONENT_LABELS) as ScoringComponent[]).map((key) => ({
    key,
    label: SCORE_COMPONENT_LABELS[key],
    points: Math.round(breakdown[key] * 10) / 10,
  }));
}

/** Whether a just-computed score breakdown should be persisted on the new
 * opportunities.score_breakdown column -- only when the household has the
 * flag on. Extracted as its own tiny pure function (rather than an inline
 * ternary in lib/opportunities/detect.ts) so the actual decision at the
 * write site is unit-tested even though detect.ts's surrounding
 * orchestration has no test harness yet (a pre-existing gap, not one this
 * module introduces -- see QUESTIONS.md QUEUE-004). */
export function resolveOpportunityScoreBreakdown(
  breakdown: Record<ScoringComponent, number> | null,
  flagEnabled: boolean
): Record<ScoringComponent, number> | null {
  if (!flagEnabled) return null;
  return breakdown;
}
