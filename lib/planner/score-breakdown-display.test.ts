import { describe, expect, it } from "vitest";
import {
  formatScoreBreakdownForDisplay,
  resolveOpportunityScoreBreakdown,
  SCORE_COMPONENT_LABELS,
} from "./score-breakdown-display";
import { SCORING_WEIGHTS } from "./weights";

const SAMPLE_BREAKDOWN = {
  weatherSuitability: 27,
  conditionData: 12.5,
  travelFeasibility: 15,
  enjoymentFit: 20,
  recencyPenalty: 10,
};

describe("formatScoreBreakdownForDisplay", () => {
  it("returns one entry per scoring component, in weather -> conditions -> travel -> enjoyment -> recency order", () => {
    const result = formatScoreBreakdownForDisplay(SAMPLE_BREAKDOWN);
    expect(result.map((r) => r.key)).toEqual([
      "weatherSuitability",
      "conditionData",
      "travelFeasibility",
      "enjoymentFit",
      "recencyPenalty",
    ]);
  });

  it("uses a friendly label, never the raw camelCase key, for every component", () => {
    const result = formatScoreBreakdownForDisplay(SAMPLE_BREAKDOWN);
    for (const entry of result) {
      expect(entry.label).toBe(SCORE_COMPONENT_LABELS[entry.key]);
      expect(entry.label).not.toBe(entry.key); // never the raw camelCase key itself
      expect(entry.label).not.toMatch(/[a-z][A-Z]/); // no camelCase hump leaking through as a label
    }
  });

  it("rounds points to one decimal place", () => {
    const result = formatScoreBreakdownForDisplay({ ...SAMPLE_BREAKDOWN, conditionData: 12.53 });
    const conditions = result.find((r) => r.key === "conditionData");
    expect(conditions?.points).toBe(12.5);
  });

  it("every component in SCORING_WEIGHTS has a display label (stays in sync if a weight is ever added)", () => {
    for (const component of Object.keys(SCORING_WEIGHTS)) {
      expect(SCORE_COMPONENT_LABELS).toHaveProperty(component);
    }
  });
});

describe("resolveOpportunityScoreBreakdown", () => {
  it("returns null when the flag is off, even if a breakdown was computed", () => {
    expect(resolveOpportunityScoreBreakdown(SAMPLE_BREAKDOWN, false)).toBeNull();
  });

  it("returns the breakdown unchanged when the flag is on", () => {
    expect(resolveOpportunityScoreBreakdown(SAMPLE_BREAKDOWN, true)).toEqual(SAMPLE_BREAKDOWN);
  });

  it("returns null when the flag is on but no breakdown was computed", () => {
    expect(resolveOpportunityScoreBreakdown(null, true)).toBeNull();
  });
});
