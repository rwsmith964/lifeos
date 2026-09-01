// Module 1 (relationship_gift_engine_v2 flag): the brief's finer gift
// pipeline tracking -- idea -> shortlisted -> decided -> ordered -> shipped
// -> arrived -> given. Deliberately pure (no DB access), following the
// same pattern as convert.ts, leadtime.ts, and dedupe.ts, so the stage
// transitions are exhaustively unit-testable.
//
// This is layered on top of the existing `gift_suggestions.status` state
// machine (suggested/saved/ordered/dismissed/converted_to_gift), not a
// replacement for it -- `status` remains the single source of truth for
// every existing screen (see database.types.ts's GiftSuggestionRow comment
// and DECISIONS.md D-117). `pipeline_stage` only exists to give households
// finer-grained tracking once they turn the flag on.
import type { GiftPipelineStage } from "../db/database.types";

export const GIFT_PIPELINE_STAGES: readonly GiftPipelineStage[] = [
  "idea",
  "shortlisted",
  "decided",
  "ordered",
  "shipped",
  "arrived",
  "given",
];

/** Human-readable label for a stage -- never show the raw enum value to a user. */
const PIPELINE_STAGE_LABELS: Record<GiftPipelineStage, string> = {
  idea: "Idea",
  shortlisted: "Shortlisted",
  decided: "Decided",
  ordered: "Ordered",
  shipped: "Shipped",
  arrived: "Arrived",
  given: "Given",
};

/** Never show the raw enum value (or "Not started") -- this is the one place that maps null too. */
export function pipelineStageLabel(stage: GiftPipelineStage | null): string {
  if (stage === null) return "Not started";
  return PIPELINE_STAGE_LABELS[stage];
}

/** -1 for null/unset (before "idea"), otherwise the stage's position in GIFT_PIPELINE_STAGES. */
export function pipelineStageIndex(stage: GiftPipelineStage | null): number {
  if (stage === null) return -1;
  return GIFT_PIPELINE_STAGES.indexOf(stage);
}

/**
 * The stage one step further along than `current`. Already-at-"given" is a
 * no-op (there's nothing past the terminal stage) rather than throwing --
 * callers drive this from a button that should just be disabled/hidden at
 * the terminal stage, not treat it as an error state.
 */
export function nextPipelineStage(current: GiftPipelineStage | null): GiftPipelineStage {
  const idx = pipelineStageIndex(current);
  if (idx >= GIFT_PIPELINE_STAGES.length - 1) return GIFT_PIPELINE_STAGES[GIFT_PIPELINE_STAGES.length - 1];
  return GIFT_PIPELINE_STAGES[idx + 1];
}

/**
 * The stage one step before `current`. Stepping back from "idea" clears
 * the stage entirely (null) -- "idea" is the first real stage, so
 * reverting further means "we haven't started tracking this yet", not an
 * error. Reverting from null is a no-op for the same disabled-button
 * reasoning as nextPipelineStage.
 */
export function previousPipelineStage(current: GiftPipelineStage | null): GiftPipelineStage | null {
  const idx = pipelineStageIndex(current);
  if (idx <= 0) return null;
  return GIFT_PIPELINE_STAGES[idx - 1];
}

export function isTerminalPipelineStage(stage: GiftPipelineStage | null): boolean {
  return stage === "given";
}
