// Weekend-planner activity scoring weights (Section 9.4): "Weights live in
// a config file, not in the AI prompt... deliberate — it makes the output
// reproducible, debuggable, and tunable." Must sum to 1.
export const SCORING_WEIGHTS = {
  weatherSuitability: 0.3,
  conditionData: 0.25,
  travelFeasibility: 0.15,
  enjoymentFit: 0.2,
  recencyPenalty: 0.1,
} as const;

export type ScoringComponent = keyof typeof SCORING_WEIGHTS;
