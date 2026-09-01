import { describe, it, expect } from "vitest";
import { computeOverallConfidence, meetsReviewThreshold, getReviewThreshold, DEFAULT_CONFIDENCE_THRESHOLD } from "./confidence";

describe("computeOverallConfidence", () => {
  it("returns the minimum field confidence, not the average", () => {
    expect(
      computeOverallConfidence({
        title: { value: "Dentist", confidence: 0.95 },
        startsAt: { value: "2026-09-10", confidence: 0.4 },
      })
    ).toBe(0.4);
  });

  it("returns 0 for a draft with no extracted fields at all", () => {
    expect(computeOverallConfidence({})).toBe(0);
  });

  it("returns the single field's confidence when there's only one", () => {
    expect(computeOverallConfidence({ title: { value: "x", confidence: 0.82 } })).toBe(0.82);
  });
});

describe("meetsReviewThreshold", () => {
  it("uses the conservative default threshold when none is passed", () => {
    expect(meetsReviewThreshold(0.75)).toBe(true);
    expect(meetsReviewThreshold(0.74)).toBe(false);
  });

  it("respects an explicit threshold", () => {
    expect(meetsReviewThreshold(0.5, 0.5)).toBe(true);
    expect(meetsReviewThreshold(0.49, 0.5)).toBe(false);
  });
});

describe("getReviewThreshold", () => {
  it("falls back to the default when the household override is null or undefined", () => {
    expect(getReviewThreshold(null)).toBe(DEFAULT_CONFIDENCE_THRESHOLD);
    expect(getReviewThreshold(undefined)).toBe(DEFAULT_CONFIDENCE_THRESHOLD);
  });

  it("falls back to the default when the override is out of the valid 0..1 range", () => {
    expect(getReviewThreshold(1.5)).toBe(DEFAULT_CONFIDENCE_THRESHOLD);
    expect(getReviewThreshold(-0.1)).toBe(DEFAULT_CONFIDENCE_THRESHOLD);
  });

  it("uses a valid override as-is", () => {
    expect(getReviewThreshold(0.9)).toBe(0.9);
    expect(getReviewThreshold(0)).toBe(0);
  });
});
