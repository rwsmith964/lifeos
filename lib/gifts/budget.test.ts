import { describe, expect, it } from "vitest";
import { FALLBACK_BUDGET_MAX_CENTS, FALLBACK_BUDGET_MIN_CENTS, resolveGiftBudget } from "./budget";

const noHouseholdDefault = { default_gift_budget_min_cents: null, default_gift_budget_max_cents: null };
const householdDefault = { default_gift_budget_min_cents: 3000, default_gift_budget_max_cents: 7500 };

describe("resolveGiftBudget", () => {
  it("prefers a person + specific-occasion budget over everything else", () => {
    const budgets = [
      { occasion_type: "birthday" as const, min_cents: 4000, max_cents: 9000 },
      { occasion_type: "default" as const, min_cents: 1000, max_cents: 2000 },
    ];
    const result = resolveGiftBudget(budgets, "birthday", householdDefault);
    expect(result).toEqual({ minCents: 4000, maxCents: 9000, source: "person_occasion" });
  });

  it("falls back to person default when no occasion-specific budget exists", () => {
    const budgets = [{ occasion_type: "default" as const, min_cents: 1000, max_cents: 2000 }];
    const result = resolveGiftBudget(budgets, "birthday", householdDefault);
    expect(result).toEqual({ minCents: 1000, maxCents: 2000, source: "person_default" });
  });

  it("falls back to household default when the person has no budgets at all", () => {
    const result = resolveGiftBudget([], "birthday", householdDefault);
    expect(result).toEqual({ minCents: 3000, maxCents: 7500, source: "household_default" });
  });

  it("falls back to the hardcoded $50-$100 range as a last resort", () => {
    const result = resolveGiftBudget([], "birthday", noHouseholdDefault);
    expect(result).toEqual({
      minCents: FALLBACK_BUDGET_MIN_CENTS,
      maxCents: FALLBACK_BUDGET_MAX_CENTS,
      source: "fallback",
    });
  });

  it("does not match a specific-occasion budget for a different occasion", () => {
    const budgets = [{ occasion_type: "christmas" as const, min_cents: 2000, max_cents: 5000 }];
    const result = resolveGiftBudget(budgets, "birthday", noHouseholdDefault);
    expect(result.source).toBe("fallback");
  });
});
