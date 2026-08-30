import { describe, expect, it } from "vitest";
import { weeksSinceLastDone } from "./recency";

describe("weeksSinceLastDone (D-083)", () => {
  it("returns null when last_done_at is null (never logged)", () => {
    expect(weeksSinceLastDone(null, new Date("2026-08-30"))).toBeNull();
  });

  it("returns 0 for something done earlier this same week", () => {
    expect(weeksSinceLastDone("2026-08-28", new Date("2026-08-30"))).toBe(0);
  });

  it("returns 1 for something done exactly a week ago", () => {
    expect(weeksSinceLastDone("2026-08-23", new Date("2026-08-30"))).toBe(1);
  });

  it("floors partial weeks down (10 days = 1 week, not 2)", () => {
    expect(weeksSinceLastDone("2026-08-20", new Date("2026-08-30"))).toBe(1);
  });

  it("treats a last_done_at somehow in the future as no signal rather than negative", () => {
    expect(weeksSinceLastDone("2026-09-15", new Date("2026-08-30"))).toBeNull();
  });
});
