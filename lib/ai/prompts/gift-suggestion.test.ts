import { describe, expect, it } from "vitest";
import {
  buildGiftSuggestionUserPrompt,
  estimateAgeYears,
  giftSuggestionAiResponseSchema,
} from "./gift-suggestion";

describe("estimateAgeYears", () => {
  it("returns null when birth year is unknown", () => {
    expect(estimateAgeYears("1900-03-14", false, new Date(2026, 7, 1))).toBeNull();
  });

  it("returns null when birthdate is null", () => {
    expect(estimateAgeYears(null, true, new Date(2026, 7, 1))).toBeNull();
  });

  it("computes age correctly after the birthday has occurred this year", () => {
    expect(estimateAgeYears("1985-03-14", true, new Date(2026, 7, 1))).toBe(41);
  });

  it("computes age correctly before the birthday occurs this year", () => {
    expect(estimateAgeYears("1985-12-14", true, new Date(2026, 7, 1))).toBe(40);
  });

  it("computes age correctly on the exact birthday", () => {
    expect(estimateAgeYears("1985-08-01", true, new Date(2026, 7, 1))).toBe(41);
  });
});

describe("giftSuggestionAiResponseSchema", () => {
  const validSuggestion = {
    title: "Fly tying kit",
    reasoning: "Dave has been tying his own flies for a year and loved his last fly rod.",
    priceTier: "mid" as const,
    estimatedCostCents: 5500,
    category: "standard" as const,
  };

  it("accepts exactly 3 suggestions covering low/mid/high", () => {
    const result = giftSuggestionAiResponseSchema.safeParse([
      { ...validSuggestion, priceTier: "low" },
      { ...validSuggestion, priceTier: "mid" },
      { ...validSuggestion, priceTier: "high" },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects fewer than 3 suggestions", () => {
    const result = giftSuggestionAiResponseSchema.safeParse([validSuggestion]);
    expect(result.success).toBe(false);
  });

  it("rejects an invalid category", () => {
    const result = giftSuggestionAiResponseSchema.safeParse([
      { ...validSuggestion, category: "not-a-real-category" },
      validSuggestion,
      validSuggestion,
    ]);
    expect(result.success).toBe(false);
  });
});

describe("buildGiftSuggestionUserPrompt", () => {
  it("includes the person label, occasion, and budget", () => {
    const prompt = buildGiftSuggestionUserPrompt({
      personLabel: "Dave Wilson",
      relationshipType: "friend",
      ageYears: 42,
      interests: [{ interest: "fly fishing", category: "outdoor", strength: "passionate" }],
      recentGifts: [],
      dismissedTitles: [],
      occasionType: "birthday",
      occasionDate: "2026-09-08",
      budgetMinCents: 4000,
      budgetMaxCents: 9000,
    });
    expect(prompt).toContain("Dave Wilson");
    expect(prompt).toContain("birthday on 2026-09-08");
    expect(prompt).toContain("$40.00 - $90.00");
    expect(prompt).toContain("fly fishing");
  });

  it("lists dismissed suggestions so the model avoids repeating them", () => {
    const prompt = buildGiftSuggestionUserPrompt({
      personLabel: "Dave Wilson",
      relationshipType: "friend",
      ageYears: null,
      interests: [],
      recentGifts: [],
      dismissedTitles: ["Generic fishing hat"],
      occasionType: "birthday",
      occasionDate: "2026-09-08",
      budgetMinCents: 1000,
      budgetMaxCents: 2000,
    });
    expect(prompt).toContain("Generic fishing hat");
  });

  it("uses a CHILD_N label when passed one, never a real name it wasn't given", () => {
    const prompt = buildGiftSuggestionUserPrompt({
      personLabel: "CHILD_1",
      relationshipType: "child",
      ageYears: 10,
      interests: [],
      recentGifts: [],
      dismissedTitles: [],
      occasionType: "birthday",
      occasionDate: "2026-09-08",
      budgetMinCents: 2000,
      budgetMaxCents: 5000,
    });
    expect(prompt).toContain("CHILD_1");
  });
});
