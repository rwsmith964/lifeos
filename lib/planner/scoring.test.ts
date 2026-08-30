import { describe, expect, it } from "vitest";
import { scoreActivity } from "./scoring";
import { SCORING_WEIGHTS } from "./weights";

const BASE_INPUTS = {
  weatherSuitabilityScore: 50,
  conditionDataScore: 50,
  travelFeasibilityScore: 50,
  enjoymentRank: 5,
};

describe("scoreActivity", () => {
  it("scores a perfect activity (all components 100) at 100", () => {
    const result = scoreActivity({
      weatherSuitabilityScore: 100,
      conditionDataScore: 100,
      travelFeasibilityScore: 100,
      enjoymentRank: 10,
      weeksSinceLastProposed: null,
    });
    expect(result.totalScore).toBe(100);
  });

  it("scores a uniformly bad activity (all components 0, proposed this same weekend) at the recency-penalty floor", () => {
    const result = scoreActivity({
      weatherSuitabilityScore: 0,
      conditionDataScore: 0,
      travelFeasibilityScore: 0,
      enjoymentRank: 0,
      weeksSinceLastProposed: 0,
    });
    // Every component is 0 except recencyPenalty, whose floor is 20 (never
    // proposing 0 outright — see recencyPenaltyScore) weighted at 0.1 = 2.
    expect(result.totalScore).toBe(2);
  });

  it("uses a neutral 50 for conditionData when null (activity type with no relevant condition data, e.g. golf)", () => {
    const withNullCondition = scoreActivity({
      weatherSuitabilityScore: 100,
      conditionDataScore: null,
      travelFeasibilityScore: 100,
      enjoymentRank: 10,
      weeksSinceLastProposed: null,
    });
    const withNeutralCondition = scoreActivity({
      weatherSuitabilityScore: 100,
      conditionDataScore: 50,
      travelFeasibilityScore: 100,
      enjoymentRank: 10,
      weeksSinceLastProposed: null,
    });
    expect(withNullCondition.totalScore).toBe(withNeutralCondition.totalScore);
  });

  it("applies a strong recency penalty for an activity proposed last weekend", () => {
    const recent = scoreActivity({
      weatherSuitabilityScore: 100,
      conditionDataScore: 100,
      travelFeasibilityScore: 100,
      enjoymentRank: 10,
      weeksSinceLastProposed: 1,
    });
    const notRecent = scoreActivity({
      weatherSuitabilityScore: 100,
      conditionDataScore: 100,
      travelFeasibilityScore: 100,
      enjoymentRank: 10,
      weeksSinceLastProposed: null,
    });
    expect(recent.totalScore).toBeLessThan(notRecent.totalScore);
  });

  it("applies no recency penalty at 3+ weeks since last proposed", () => {
    const threeWeeks = scoreActivity({
      weatherSuitabilityScore: 100,
      conditionDataScore: 100,
      travelFeasibilityScore: 100,
      enjoymentRank: 10,
      weeksSinceLastProposed: 3,
    });
    expect(threeWeeks.totalScore).toBe(100);
  });

  it("weighs enjoyment rank into the score", () => {
    const highEnjoyment = scoreActivity({
      weatherSuitabilityScore: 50,
      conditionDataScore: 50,
      travelFeasibilityScore: 50,
      enjoymentRank: 10,
      weeksSinceLastProposed: null,
    });
    const lowEnjoyment = scoreActivity({
      weatherSuitabilityScore: 50,
      conditionDataScore: 50,
      travelFeasibilityScore: 50,
      enjoymentRank: 1,
      weeksSinceLastProposed: null,
    });
    expect(highEnjoyment.totalScore).toBeGreaterThan(lowEnjoyment.totalScore);
  });

  it("breakdown values sum to the total score", () => {
    const result = scoreActivity({
      weatherSuitabilityScore: 80,
      conditionDataScore: 60,
      travelFeasibilityScore: 90,
      enjoymentRank: 7,
      weeksSinceLastProposed: 2,
    });
    const sum = Object.values(result.breakdown).reduce((a, b) => a + b, 0);
    expect(Math.round(sum)).toBe(result.totalScore);
  });

  it("is reproducible: identical inputs give identical output", () => {
    const inputs = {
      weatherSuitabilityScore: 72,
      conditionDataScore: 41,
      travelFeasibilityScore: 88,
      enjoymentRank: 8,
      weeksSinceLastProposed: 2,
    };
    expect(scoreActivity(inputs)).toEqual(scoreActivity(inputs));
  });

  it("scoring weights sum to 1 (config sanity check)", () => {
    const total = Object.values(SCORING_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  // D-083 (P3-1): weeksSinceLastDone combines with weeksSinceLastProposed
  // (whichever recency signal is more recent wins) before the penalty curve.
  describe("weeksSinceLastDone (D-083)", () => {
    it("is treated the same as weeksSinceLastProposed when it's the only signal present", () => {
      const viaProposed = scoreActivity({ ...BASE_INPUTS, weeksSinceLastProposed: 1, weeksSinceLastDone: null });
      const viaDone = scoreActivity({ ...BASE_INPUTS, weeksSinceLastProposed: null, weeksSinceLastDone: 1 });
      expect(viaDone.totalScore).toBe(viaProposed.totalScore);
    });

    it("uses whichever signal is more recent (smaller weeks) when both are present", () => {
      // Proposed 3 weeks ago, but actually done just last weekend -- the real
      // completion should dominate and apply the harsher (more recent) penalty.
      const combined = scoreActivity({ ...BASE_INPUTS, weeksSinceLastProposed: 3, weeksSinceLastDone: 1 });
      const doneOnly = scoreActivity({ ...BASE_INPUTS, weeksSinceLastProposed: 1, weeksSinceLastDone: null });
      expect(combined.totalScore).toBe(doneOnly.totalScore);
    });

    it("omitting weeksSinceLastDone entirely behaves like passing null (backward compatible with existing callers)", () => {
      const omitted = scoreActivity({ ...BASE_INPUTS, weeksSinceLastProposed: 2 });
      const explicitNull = scoreActivity({ ...BASE_INPUTS, weeksSinceLastProposed: 2, weeksSinceLastDone: null });
      expect(omitted.totalScore).toBe(explicitNull.totalScore);
    });
  });
});
