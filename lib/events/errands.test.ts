import { describe, expect, it } from "vitest";
import { errandIdeasFromNote, personalNoteFromDescription } from "./errands";

describe("errandIdeasFromNote", () => {
  it("turns 'bake a pecan pie' into a cooking errand", () => {
    expect(errandIdeasFromNote("Bake a pecan pie")).toEqual([{ what: "pecan pie", cook: true }]);
  });
  it("treats 'bring' as shopping only", () => {
    expect(errandIdeasFromNote("Bring drinks")).toEqual([{ what: "drinks", cook: false }]);
  });
  it("handles several items", () => {
    const ideas = errandIdeasFromNote("Make the green bean casserole, bring ice and buy napkins");
    expect(ideas.map((i) => i.what)).toEqual(["green bean casserole", "ice", "napkins"]);
    expect(ideas.map((i) => i.cook)).toEqual([true, false, false]);
  });
  it("ignores notes with nothing to do", () => {
    expect(errandIdeasFromNote("Kids table this year")).toEqual([]);
    expect(errandIdeasFromNote(null)).toEqual([]);
  });
});

describe("personalNoteFromDescription", () => {
  it("finds the invitee's own line", () => {
    expect(personalNoteFromDescription("Hosted by Rusty\nYour note: bring pie\nDress: casual")).toBe("bring pie");
    expect(personalNoteFromDescription("Hosted by Rusty")).toBeNull();
    expect(personalNoteFromDescription(null)).toBeNull();
  });
});
