// Gift budget resolution (Section 4.2): person + specific occasion ->
// person + 'default' -> household default -> hardcoded fallback ($50-$100).
// Pure and unit-tested.
import type { HouseholdRow, OccasionType, PersonGiftBudgetRow } from "../db/database.types";

export const FALLBACK_BUDGET_MIN_CENTS = 5000;
export const FALLBACK_BUDGET_MAX_CENTS = 10000;

export interface ResolvedBudget {
  minCents: number;
  maxCents: number;
  source: "person_occasion" | "person_default" | "household_default" | "fallback";
}

export function resolveGiftBudget(
  budgets: Pick<PersonGiftBudgetRow, "occasion_type" | "min_cents" | "max_cents">[],
  occasionType: OccasionType,
  household: Pick<HouseholdRow, "default_gift_budget_min_cents" | "default_gift_budget_max_cents">
): ResolvedBudget {
  const specific = budgets.find((b) => b.occasion_type === occasionType);
  if (specific) {
    return { minCents: specific.min_cents, maxCents: specific.max_cents, source: "person_occasion" };
  }

  const personDefault = budgets.find((b) => b.occasion_type === "default");
  if (personDefault) {
    return { minCents: personDefault.min_cents, maxCents: personDefault.max_cents, source: "person_default" };
  }

  if (household.default_gift_budget_min_cents != null && household.default_gift_budget_max_cents != null) {
    return {
      minCents: household.default_gift_budget_min_cents,
      maxCents: household.default_gift_budget_max_cents,
      source: "household_default",
    };
  }

  return { minCents: FALLBACK_BUDGET_MIN_CENTS, maxCents: FALLBACK_BUDGET_MAX_CENTS, source: "fallback" };
}
