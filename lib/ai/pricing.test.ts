import { describe, expect, it } from "vitest";
import { estimateCostCents } from "./pricing";

describe("estimateCostCents", () => {
  it("computes cost for 1M input + 1M output tokens as input+output rate", () => {
    expect(estimateCostCents(1_000_000, 1_000_000)).toBeCloseTo(300 + 1500, 4);
  });

  it("computes cost for a small realistic call", () => {
    // 1500 input tokens * $3/MTok = 0.45c; 400 output tokens * $15/MTok = 0.6c
    const cost = estimateCostCents(1500, 400);
    expect(cost).toBeCloseTo(1.05, 4);
  });

  it("returns 0 for a zero-token call", () => {
    expect(estimateCostCents(0, 0)).toBe(0);
  });
});
