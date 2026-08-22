import { describe, expect, it } from "vitest";
import { buildChildTokenMap } from "./context";
import type { PersonRow } from "../db/database.types";

function person(id: string, full_name: string, relationship_type: PersonRow["relationship_type"]) {
  return { id, full_name, relationship_type };
}

describe("buildChildTokenMap", () => {
  it("uses the real name for a non-child person", () => {
    const map = buildChildTokenMap([person("a", "Dave Wilson", "friend")]);
    expect(map.labelFor(person("a", "Dave Wilson", "friend"))).toBe("Dave Wilson");
  });

  it("tokenizes a child person instead of using their real name", () => {
    const map = buildChildTokenMap([person("a", "Emma Smith", "child")]);
    const label = map.labelFor(person("a", "Emma Smith", "child"));
    expect(label).toMatch(/^CHILD_\d+$/);
    expect(label).not.toContain("Emma");
  });

  it("assigns distinct tokens to multiple children, deterministically by id", () => {
    const kids = [person("b", "Jack Smith", "child"), person("a", "Emma Smith", "child")];
    const map = buildChildTokenMap(kids);
    // sorted by id: "a" (Emma) gets CHILD_1, "b" (Jack) gets CHILD_2
    expect(map.labelFor(kids[1])).toBe("CHILD_1"); // Emma, id "a"
    expect(map.labelFor(kids[0])).toBe("CHILD_2"); // Jack, id "b"
  });

  it("restores tokens back to real names in AI-generated text", () => {
    const map = buildChildTokenMap([person("a", "Emma Smith", "child")]);
    const aiText = "CHILD_1 has soccer practice on Tuesday.";
    expect(map.restoreRealNames(aiText)).toBe("Emma Smith has soccer practice on Tuesday.");
  });

  it("restores multiple occurrences and multiple children", () => {
    const map = buildChildTokenMap([
      person("a", "Emma Smith", "child"),
      person("b", "Jack Smith", "child"),
    ]);
    const aiText = "CHILD_1 and CHILD_2 both have appointments. CHILD_1 is first.";
    expect(map.restoreRealNames(aiText)).toBe(
      "Emma Smith and Jack Smith both have appointments. Emma Smith is first."
    );
  });

  it("never puts a child's real name in a label, even if asked for the same person object repeatedly", () => {
    const kid = person("a", "Emma Smith", "child");
    const map = buildChildTokenMap([kid]);
    for (let i = 0; i < 5; i++) {
      expect(map.labelFor(kid)).not.toContain("Emma");
    }
  });
});
