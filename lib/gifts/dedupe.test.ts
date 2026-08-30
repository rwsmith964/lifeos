import { describe, expect, it } from "vitest";
import {
  FUZZY_TITLE_DUPLICATE_THRESHOLD,
  dedupeFuzzyTitles,
  dedupeSuggestionsPerPerson,
  isFuzzyDuplicateTitle,
  titleSimilarity,
} from "./dedupe";

describe("titleSimilarity", () => {
  it("is 1 for identical titles ignoring case", () => {
    expect(titleSimilarity("Little Tikes TotSports Easy Hit Golf Set", "little tikes totsports easy hit golf set")).toBe(
      1
    );
  });

  it("catches the real production near-duplicate: Hit vs Score Golf Set (0.75)", () => {
    const sim = titleSimilarity(
      "Little Tikes Totsports Easy Hit Golf Set",
      "Little Tikes TotSports Easy Score Golf Set"
    );
    expect(sim).toBeCloseTo(0.75, 2);
    expect(sim).toBeGreaterThanOrEqual(FUZZY_TITLE_DUPLICATE_THRESHOLD);
  });

  it("catches plural/short-suffix variants via prefix matching: Trucks/Truck, Smashers/Smash", () => {
    const sim = titleSimilarity(
      "Hot Wheels Monster Trucks Arena Smashers Playset",
      "Hot Wheels Monster Truck Arena Smash Playset"
    );
    expect(sim).toBe(1);
  });

  it("does not flag clearly different gift titles for the same person", () => {
    const sim = titleSimilarity("LEGO City Race Car Set", "Personalized Book Subscription (3-Month Plan)");
    expect(sim).toBeLessThan(FUZZY_TITLE_DUPLICATE_THRESHOLD);
  });

  it("returns 0 when a title has no significant tokens", () => {
    expect(titleSimilarity("the a of", "Golf Set")).toBe(0);
  });
});

describe("isFuzzyDuplicateTitle", () => {
  it("flags a candidate matching an existing title above the threshold", () => {
    expect(
      isFuzzyDuplicateTitle("Little Tikes TotSports Easy Score Golf Set", [
        "Little Tikes Totsports Easy Hit Golf Set",
      ])
    ).toBe(true);
  });

  it("does not flag a genuinely distinct candidate", () => {
    expect(isFuzzyDuplicateTitle("Youth Soccer Training Rebounder Net", ["Little Tikes Totsports Easy Hit Golf Set"])).toBe(
      false
    );
  });

  it("returns false against an empty list", () => {
    expect(isFuzzyDuplicateTitle("Anything", [])).toBe(false);
  });
});

describe("dedupeFuzzyTitles", () => {
  it("keeps only the first occurrence of each fuzzy-duplicate group (the exact 8-suggestion production case)", () => {
    const titles = [
      "Little Tikes Totsports Easy Hit Golf Set",
      "Power Wheels Monster Traction Ride-On Monster Truck",
      "Little Tikes TotSports Easy Score Golf Set", // dup of #1
      "Hot Wheels Monster Trucks Arena Smashers Playset",
      "Step2 Hit & Spin Golf Set with Carry Bag",
      "Hot Wheels Monster Truck Arena Smash Playset", // dup of #4
      "Little Tikes TotSports Easy Hit Golf Set", // exact dup of #1
      "Defy Trampoline Park Party or Jump Pass Bundle",
    ];
    const deduped = dedupeFuzzyTitles(titles, (t) => t);
    expect(deduped).toEqual([
      "Little Tikes Totsports Easy Hit Golf Set",
      "Power Wheels Monster Traction Ride-On Monster Truck",
      "Hot Wheels Monster Trucks Arena Smashers Playset",
      "Step2 Hit & Spin Golf Set with Carry Bag",
      "Defy Trampoline Park Party or Jump Pass Bundle",
    ]);
  });

  it("is a no-op when every title is distinct", () => {
    const titles = ["Golf Set", "Book Subscription", "Trampoline Pass"];
    expect(dedupeFuzzyTitles(titles, (t) => t)).toEqual(titles);
  });
});

describe("dedupeSuggestionsPerPerson", () => {
  it("collapses fuzzy-duplicate titles within the same person, keeping the first (most urgent)", () => {
    const suggestions = [
      { id: "1", person_id: "cal", title: "Little Tikes Totsports Easy Hit Golf Set" },
      { id: "2", person_id: "cal", title: "Power Wheels Monster Traction Ride-On Monster Truck" },
      { id: "3", person_id: "cal", title: "Little Tikes TotSports Easy Score Golf Set" }, // dup of #1
    ];
    const deduped = dedupeSuggestionsPerPerson(suggestions);
    expect(deduped.map((s) => s.id)).toEqual(["1", "2"]);
  });

  it("does not dedupe the same title across different people", () => {
    const suggestions = [
      { id: "1", person_id: "cal", title: "Lego Classic Creative Brick Box" },
      { id: "2", person_id: "emma", title: "Lego Classic Creative Brick Box" },
    ];
    expect(dedupeSuggestionsPerPerson(suggestions).map((s) => s.id)).toEqual(["1", "2"]);
  });

  it("preserves overall relative order when different people's suggestions are interleaved", () => {
    const suggestions = [
      { id: "1", person_id: "cal", title: "Little Tikes Totsports Easy Hit Golf Set" },
      { id: "2", person_id: "emma", title: "Youth Soccer Rebounder Net" },
      { id: "3", person_id: "cal", title: "Little Tikes TotSports Easy Score Golf Set" }, // dup of #1
      { id: "4", person_id: "emma", title: "Watercolor Paint Set" },
    ];
    expect(dedupeSuggestionsPerPerson(suggestions).map((s) => s.id)).toEqual(["1", "2", "4"]);
  });
});
