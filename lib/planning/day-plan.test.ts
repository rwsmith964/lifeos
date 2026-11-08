import { describe, expect, it } from "vitest";
import { atClockTime, buildTimeline, mealWindowsCrossed, resolvePersonReference, roundUpToFive, type ReferencePerson } from "./day-plan";

const person = (over: Partial<ReferencePerson> & { id: string; full_name: string }): ReferencePerson => ({
  nickname: null,
  relationship_type: "friend",
  ...over,
});

const people: ReferencePerson[] = [
  person({ id: "me", full_name: "Richard Smith", relationship_type: "self" }),
  person({ id: "fritz", full_name: "Fritz Smith", relationship_type: "parent", gender: "male" }),
  person({ id: "mom", full_name: "Linda Smith", relationship_type: "parent", gender: "female" }),
  person({ id: "mel", full_name: "Mel Jones", relationship_type: "co_parent" }),
  person({ id: "rusty", full_name: "Rusty Clark", nickname: "Rusty", relationship_type: "extended_family" }),
];

describe("resolvePersonReference", () => {
  it("maps 'Dad's' to the father on file", () => {
    expect(resolvePersonReference("Dad's", people)).toEqual({ kind: "match", personId: "fritz" });
    expect(resolvePersonReference("my dad", people)).toEqual({ kind: "match", personId: "fritz" });
  });
  it("maps 'mom' to the mother", () => {
    expect(resolvePersonReference("mom", people)).toEqual({ kind: "match", personId: "mom" });
  });
  it("matches by name or nickname first", () => {
    expect(resolvePersonReference("Fritz", people)).toEqual({ kind: "match", personId: "fritz" });
    expect(resolvePersonReference("Rusty's", people)).toEqual({ kind: "match", personId: "rusty" });
  });
  it("is ambiguous when two parents have no gender on file", () => {
    const noGender = people.map((p) => (p.relationship_type === "parent" ? { ...p, gender: null } : p));
    expect(resolvePersonReference("dad", noGender)).toEqual({ kind: "ambiguous", personIds: ["fritz", "mom"] });
  });
  it("returns none for a place or an unknown word", () => {
    expect(resolvePersonReference("Costco", people)).toEqual({ kind: "none" });
    expect(resolvePersonReference("grandpa", people)).toEqual({ kind: "none" });
  });
  it("never resolves to yourself or an archived person", () => {
    expect(resolvePersonReference("Richard", people)).toEqual({ kind: "none" });
    expect(resolvePersonReference("dad", people.map((p) => (p.id === "fritz" ? { ...p, is_archived: true } : p)))).toEqual({ kind: "none" });
  });
});

describe("timeline", () => {
  const start = new Date(2026, 10, 14, 10, 15);
  const timeline = buildTimeline(start, [
    { key: "a", name: "Mermaid Cafe", durationMinutes: 90, driveMinutes: 15 },
    { key: "b", name: "Defy", durationMinutes: 120, driveMinutes: 10 },
    { key: "c", name: "Costco", durationMinutes: 45, driveMinutes: 20 },
  ]);

  it("adds drive time before each stop and chains them", () => {
    expect(timeline[0].arriveAt).toEqual(new Date(2026, 10, 14, 10, 30));
    expect(timeline[0].leaveAt).toEqual(new Date(2026, 10, 14, 12, 0));
    expect(timeline[1].arriveAt).toEqual(new Date(2026, 10, 14, 12, 10));
    expect(timeline[1].leaveAt).toEqual(new Date(2026, 10, 14, 14, 10));
    expect(timeline[2].arriveAt).toEqual(new Date(2026, 10, 14, 14, 30));
    expect(timeline[2].leaveAt).toEqual(new Date(2026, 10, 14, 15, 15));
  });

  it("detects the meals the plan runs across", () => {
    expect(mealWindowsCrossed(start, timeline[2].leaveAt)).toEqual(["lunch"]);
    expect(mealWindowsCrossed(new Date(2026, 10, 14, 15, 0), new Date(2026, 10, 14, 20, 0))).toEqual(["dinner"]);
    expect(mealWindowsCrossed(new Date(2026, 10, 14, 9, 0), new Date(2026, 10, 14, 10, 30))).toEqual([]);
  });
});

describe("clock helpers", () => {
  it("rounds up to the next five minutes", () => {
    expect(roundUpToFive(new Date(2026, 10, 14, 10, 1)).getMinutes()).toBe(5);
    expect(roundUpToFive(new Date(2026, 10, 14, 10, 5)).getMinutes()).toBe(5);
  });
  it("sets a clock time on a given day", () => {
    expect(atClockTime(new Date(2026, 10, 14, 3, 0), "13:30")).toEqual(new Date(2026, 10, 14, 13, 30));
  });
});
