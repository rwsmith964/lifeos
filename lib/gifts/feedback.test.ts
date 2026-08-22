import { describe, expect, it } from "vitest";
import { bumpStrength, interestsMatchingGift, lowerStrength } from "./feedback";

describe("bumpStrength", () => {
  it("moves casual -> regular", () => expect(bumpStrength("casual")).toBe("regular"));
  it("moves regular -> passionate", () => expect(bumpStrength("regular")).toBe("passionate"));
  it("caps at passionate", () => expect(bumpStrength("passionate")).toBe("passionate"));
});

describe("lowerStrength", () => {
  it("moves passionate -> regular", () => expect(lowerStrength("passionate")).toBe("regular"));
  it("moves regular -> casual", () => expect(lowerStrength("regular")).toBe("casual"));
  it("floors at casual", () => expect(lowerStrength("casual")).toBe("casual"));
});

describe("interestsMatchingGift", () => {
  const interests = [
    { id: "i1", interest: "fly fishing", strength: "passionate" as const },
    { id: "i2", interest: "golf", strength: "regular" as const },
  ];

  it("matches via shared significant word (the spec's own example)", () => {
    const matched = interestsMatchingGift(interests, { description: "Orvis fly rod combo" });
    expect(matched.map((m) => m.id)).toEqual(["i1"]);
  });

  it("matches golf equipment to the golf interest", () => {
    const matched = interestsMatchingGift(interests, { description: "Titleist golf glove set" });
    expect(matched.map((m) => m.id)).toEqual(["i2"]);
  });

  it("returns no matches for an unrelated gift", () => {
    const matched = interestsMatchingGift(interests, { description: "Chapter book bundle" });
    expect(matched).toEqual([]);
  });

  it("ignores stopwords so 'gift set' alone doesn't match everything", () => {
    const matched = interestsMatchingGift(interests, { description: "gift set for the home" });
    expect(matched).toEqual([]);
  });

  it("can match more than one interest", () => {
    const both = [
      { id: "i1", interest: "golf", strength: "regular" as const },
      { id: "i2", interest: "golf gear", strength: "casual" as const },
    ];
    const matched = interestsMatchingGift(both, { description: "New golf shoes" });
    expect(matched.map((m) => m.id).sort()).toEqual(["i1", "i2"]);
  });
});
