import { describe, expect, it } from "vitest";
import { matchNamesToPeople, type MatchablePerson } from "./match-names";

const people: MatchablePerson[] = [
  { id: "a", full_name: "Sam Rivera", nickname: null, relationship_type: "friend" },
  { id: "b", full_name: "Samantha Lee", nickname: "Sammy", relationship_type: "colleague" },
  { id: "c", full_name: "Brittney Lane", nickname: null, relationship_type: "partner", relationship_label: "Girlfriend" },
  { id: "d", full_name: "Michael Chen", nickname: "Mike", relationship_type: "friend" },
  { id: "e", full_name: "Jordan Smith", nickname: null, relationship_type: "sibling" },
  { id: "f", full_name: "Jamie Smith", nickname: null, relationship_type: "sibling" },
];

describe("matchNamesToPeople", () => {
  it("pre-selects an exact full name", () => {
    const [m] = matchNamesToPeople(["Sam Rivera"], people);
    expect(m.status).toBe("confident");
    expect(m.candidates[0]).toMatchObject({ personId: "a", score: 1 });
  });

  it("matches a nickname plus last name", () => {
    const [m] = matchNamesToPeople(["Mike Chen"], people);
    expect(m.status).toBe("confident");
    expect(m.candidates[0].personId).toBe("d");
  });

  it("matches a short first name to a longer one with the same last name", () => {
    const [m] = matchNamesToPeople(["Sam Lee"], people);
    expect(m.candidates[0].personId).toBe("b");
  });

  it("asks when a bare first name could be several people", () => {
    const [m] = matchNamesToPeople(["Sam"], people);
    expect(m.status).toBe("possible");
    expect(m.candidates.map((c) => c.personId)).toContain("a");
  });

  it("reports the relationship so the question is answerable", () => {
    const [m] = matchNamesToPeople(["Brittney"], people);
    expect(m.candidates[0]).toMatchObject({ personId: "c", relationship: "Girlfriend" });
  });

  it("strips titles and accents", () => {
    const [m] = matchNamesToPeople(["Dr. Michael Chén"], people);
    expect(m.candidates[0].personId).toBe("d");
  });

  it("does not match a different person who only shares a last name", () => {
    const [m] = matchNamesToPeople(["Jess Smith"], people);
    expect(m.status).toBe("none");
  });

  it("treats family and guest wording as not-a-person", () => {
    const result = matchNamesToPeople(["The Smith Family", "Plus one"], people);
    expect(result.every((r) => r.status === "none" && r.candidates.length === 0)).toBe(true);
  });

  it("de-duplicates repeated names", () => {
    expect(matchNamesToPeople(["Sam Rivera", "sam rivera"], people)).toHaveLength(1);
  });
});
