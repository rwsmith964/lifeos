import { describe, expect, it } from "vitest";
import { scoreActivity } from "./scoring";
import { SCORING_WEIGHTS } from "./weights";

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
});
