import { describe, expect, it } from "vitest";
import { suggestionToGivenGiftInsert } from "./convert";
import type { GiftSuggestionRow } from "../db/database.types";

function makeSuggestion(overrides: Partial<GiftSuggestionRow> = {}): GiftSuggestionRow {
  return {
    id: "sugg-1",
    person_id: "person-1",
    occasion_type: "birthday",
    occasion_date: "2026-12-01",
    title: "Lego Star Wars set",
    reasoning: "They love building sets.",
    price_tier: "mid",
    estimated_cost_cents: 4999,
    category: "toys",
    product_url: "https://example.com/lego",
    retailer: "Target",
    order_by_date: "2026-11-20",
    status: "ordered",
    generated_at: "2026-11-01T00:00:00.000Z",
    model_version: "test-model",
    pipeline_stage: null,
    ...overrides,
  };
}

describe("suggestionToGivenGiftInsert", () => {
  it("maps title, occasion, cost, and product fields straight across", () => {
    const gift = suggestionToGivenGiftInsert(makeSuggestion());
    expect(gift.person_id).toBe("person-1");
    expect(gift.occasion_type).toBe("birthday");
    expect(gift.occasion_date).toBe("2026-12-01");
    expect(gift.description).toBe("Lego Star Wars set");
    expect(gift.category).toBe("toys");
    expect(gift.cost_cents).toBe(4999);
    expect(gift.product_url).toBe("https://example.com/lego");
  });

  it("always sets status to given, regardless of the suggestion's own status", () => {
    const gift = suggestionToGivenGiftInsert(makeSuggestion({ status: "saved" }));
    expect(gift.status).toBe("given");
  });

  it("notes mention the retailer when one was recorded", () => {
    const gift = suggestionToGivenGiftInsert(makeSuggestion({ retailer: "Amazon" }));
    expect(gift.notes).toBe("Ordered via Amazon.");
  });

  it("notes are empty when no retailer was recorded", () => {
    const gift = suggestionToGivenGiftInsert(makeSuggestion({ retailer: null }));
    expect(gift.notes).toBe("");
  });

  it("passes through a null category untouched", () => {
    const gift = suggestionToGivenGiftInsert(makeSuggestion({ category: null }));
    expect(gift.category).toBeNull();
  });
});
