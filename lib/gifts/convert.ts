// P3-4: converting a shortlisted suggestion into a permanent Gift history
// entry when the household marks it "Given". Deliberately pure (no DB
// access) so the suggestion -> gift field mapping is exhaustively
// unit-testable, following the same pattern as leadtime.ts and dedupe.ts.
//
// The `gifts` table already had a 5-state `status` column (idea, chosen,
// ordered, delivered, given) from the original schema, but nothing in the
// app ever wrote a row with any status but "given" (via the manual
// "record a gift you already gave" form) -- this is the first write path
// that uses "given" as the *result* of a shortlist lifecycle instead of a
// standalone manual entry.
import type { GiftInsert, GiftSuggestionRow } from "../db/database.types";

/**
 * Maps a gift_suggestions row to the gifts insert payload written when the
 * household marks a shortlisted, ordered suggestion as "Given". Always
 * produces status "given" -- this is the terminal step of the Saved ->
 * Ordered -> Given lifecycle, not a general-purpose mapper for the other
 * gift_status values.
 */
export function suggestionToGivenGiftInsert(suggestion: GiftSuggestionRow): GiftInsert {
  return {
    person_id: suggestion.person_id,
    occasion_type: suggestion.occasion_type,
    occasion_date: suggestion.occasion_date,
    description: suggestion.title,
    category: suggestion.category,
    cost_cents: suggestion.estimated_cost_cents,
    status: "given",
    product_url: suggestion.product_url,
    notes: suggestion.retailer ? `Ordered via ${suggestion.retailer}.` : "",
  };
}
