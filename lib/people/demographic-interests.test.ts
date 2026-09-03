import { describe, expect, it } from "vitest";
import { ageBucketFor, suggestedInterestsFor } from "./demographic-interests";

describe("ageBucketFor", () => {
  it("buckets known ages into the right life stage", () => {
    expect(ageBucketFor(1)).toBe("infant_toddler");
    expect(ageBucketFor(4)).toBe("preschool");
    expect(ageBucketFor(6)).toBe("young_child");
    expect(ageBucketFor(10)).toBe("tween");
    expect(ageBucketFor(15)).toBe("teen");
    expect(ageBucketFor(22)).toBe("young_adult");
    expect(ageBucketFor(40)).toBe("adult");
    expect(ageBucketFor(70)).toBe("senior");
  });

  it("returns unknown when age is null", () => {
    expect(ageBucketFor(null)).toBe("unknown");
  });
});

describe("suggestedInterestsFor", () => {
  it("returns kid-relevant suggestions for a young child's age", () => {
    const suggestions = suggestedInterestsFor(6, "child");
    const names = suggestions.map((s) => s.interest);
    expect(names).toContain("Spiderman");
    expect(names).toContain("Paw Patrol");
  });

  it("falls back to the child bucket when age is unknown but relationship_type is child", () => {
    const suggestions = suggestedInterestsFor(null, "child");
    const names = suggestions.map((s) => s.interest);
    expect(names).toContain("Paw Patrol");
  });

  it("falls back to the adult bucket when age is unknown and relationship_type is an adult role", () => {
    const suggestions = suggestedInterestsFor(null, "spouse");
    const names = suggestions.map((s) => s.interest);
    expect(names.length).toBeGreaterThan(0);
    expect(names).not.toContain("Paw Patrol");
  });

  it("never returns an empty list, even for an unmapped relationship type", () => {
    const suggestions = suggestedInterestsFor(null, "other");
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it("every suggestion has both an interest name and a category", () => {
    for (const bucketAge of [1, 4, 6, 10, 15, 22, 40, 70]) {
      const suggestions = suggestedInterestsFor(bucketAge, "self");
      for (const s of suggestions) {
        expect(s.interest.length).toBeGreaterThan(0);
        expect(s.category.length).toBeGreaterThan(0);
      }
    }
  });
});
