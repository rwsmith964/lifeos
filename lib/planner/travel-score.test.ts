import { describe, expect, it } from "vitest";
import { scoreTravelFeasibility } from "./travel-score";

describe("scoreTravelFeasibility", () => {
  it("scores 100 for zero travel time", () => {
    expect(scoreTravelFeasibility(0, 240)).toBe(100);
  });

  it("scores 0 when round-trip travel consumes the entire block", () => {
    expect(scoreTravelFeasibility(120, 240)).toBe(0);
  });

  it("scores 0 when travel exceeds the available block", () => {
    expect(scoreTravelFeasibility(200, 240)).toBe(0);
  });

  it("scores a short drive relative to a long block highly", () => {
    const score = scoreTravelFeasibility(15, 240); // 30 min round trip in a 4-hour block
    expect(score).toBeGreaterThan(80);
  });

  it("scores a moderate drive relative to a short block lower", () => {
    const shortBlock = scoreTravelFeasibility(30, 90); // 60 min round trip in 90 min block
    const longBlock = scoreTravelFeasibility(30, 300); // same drive, 5-hour block
    expect(shortBlock).toBeLessThan(longBlock);
  });

  it("returns 0 for a non-positive available block", () => {
    expect(scoreTravelFeasibility(10, 0)).toBe(0);
  });
});
