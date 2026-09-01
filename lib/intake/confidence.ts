// Module 3 (D-119, universal_intake_v2 flag): confidence-threshold logic
// shared by the intake endpoint and the review queue. Pure and unit
// tested -- no I/O.

/**
 * Default review threshold, per the brief: "Threshold configurable,
 * default conservative." 0.75 means anything the AI itself isn't fairly
 * sure about lands in the review queue rather than being surfaced as
 * ready to convert straight away. Household-level override is stored on
 * households.intake_confidence_threshold (nullable numeric) -- see
 * getReviewThreshold below; no column of that name exists yet (deferred,
 * see QUESTIONS.md QUEUE-007) so every household uses this default in v1.
 */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.75;

/** A field-level extraction, exactly the shape stored in
 * intake_drafts.extracted_fields. */
export interface ExtractedField {
  value: unknown;
  confidence: number;
}

/** The overall confidence for a draft is the MINIMUM of its field
 * confidences -- a draft is only as trustworthy as its least-confident
 * field, not its average. A draft with zero fields has no signal at all,
 * so it's treated as maximally uncertain (0) rather than falsely
 * confident. */
export function computeOverallConfidence(fields: Record<string, ExtractedField>): number {
  const confidences = Object.values(fields).map((f) => f.confidence);
  if (confidences.length === 0) return 0;
  return Math.min(...confidences);
}

/** True when a draft's overall confidence is at or above the household's
 * threshold -- these are eligible to be surfaced as "ready" rather than
 * routed to the review queue. Detected type 'ambiguous' always fails this
 * regardless of confidence (see isRoutableType) since the brief requires
 * ambiguous-type drafts to always land in the review queue. */
export function meetsReviewThreshold(overallConfidence: number, threshold: number = DEFAULT_CONFIDENCE_THRESHOLD): boolean {
  return overallConfidence >= threshold;
}

/** Resolves the household's configured threshold, falling back to the
 * conservative default -- single choke point so a future
 * household-level setting only needs to change this function. */
export function getReviewThreshold(householdThresholdOverride: number | null | undefined): number {
  if (householdThresholdOverride == null) return DEFAULT_CONFIDENCE_THRESHOLD;
  if (householdThresholdOverride < 0 || householdThresholdOverride > 1) return DEFAULT_CONFIDENCE_THRESHOLD;
  return householdThresholdOverride;
}
