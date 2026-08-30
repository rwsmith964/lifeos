import { describe, expect, it } from "vitest";
import { buildChildTokenMap } from "./context";
import type { PersonRow } from "../db/database.types";

function person(
  id: string,
  full_name: string,
  relationship_type: PersonRow["relationship_type"],
  nickname: string | null = null
) {
  return { id, full_name, relationship_type, nickname };
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

  // P0-2: AI features weren't receiving the nicknames the app displays
  // elsewhere, so "Cal"/"Em" failed to resolve in Quick Capture/Brain Dump
  // even though the People list shows them by nickname.
  it("prefers a non-child person's nickname over their full name in the label", () => {
    const dave = person("a", "David Wilson", "friend", "Dave");
    const map = buildChildTokenMap([dave]);
    expect(map.labelFor(dave)).toBe("Dave");
  });

  it("falls back to full name when a non-child person has no nickname", () => {
    const dave = person("a", "David Wilson", "friend", null);
    const map = buildChildTokenMap([dave]);
    expect(map.labelFor(dave)).toBe("David Wilson");
  });

  it("redacts a child's nickname mention in free text to their token", () => {
    const cal = person("a", "Callan Smith", "child", "Cal");
    const map = buildChildTokenMap([cal]);
    expect(map.redactMentions("Cal's shoe size is 10")).toBe("CHILD_1's shoe size is 10");
  });

  it("redacts a child's full name and first name mention, case-insensitively", () => {
    const cal = person("a", "Callan Smith", "child", "Cal");
    const map = buildChildTokenMap([cal]);
    expect(map.redactMentions("callan smith has a dentist appointment")).toBe(
      "CHILD_1 has a dentist appointment"
    );
    expect(map.redactMentions("Callan needs new shoes")).toBe("CHILD_1 needs new shoes");
  });

  it("does not redact a substring that merely contains a child's nickname", () => {
    const em = person("a", "Emlyn Smith", "child", "Em");
    const map = buildChildTokenMap([em]);
    // "Emlyn" contains "Em" but is a distinct word and should match the
    // full-name variant, not get double-redacted or partially mangled.
    expect(map.redactMentions("Emlyn has a playdate Friday")).toBe("CHILD_1 has a playdate Friday");
    // A genuinely unrelated word containing "em" must be left alone.
    expect(map.redactMentions("remember to buy milk")).toBe("remember to buy milk");
  });

  it("leaves non-child people's names untouched when redacting mentions", () => {
    const dave = person("a", "David Wilson", "friend", "Dave");
    const cal = person("b", "Callan Smith", "child", "Cal");
    const map = buildChildTokenMap([dave, cal]);
    expect(map.redactMentions("Dave is picking up Cal from school")).toBe("Dave is picking up CHILD_1 from school");
  });

  it("resolves the same mention the same way across repeated calls, for batch consistency", () => {
    const cal = person("a", "Callan Smith", "child", "Cal");
    const map = buildChildTokenMap([cal]);
    const first = map.redactMentions("Cal's shoe size is 10");
    const second = map.redactMentions("Cal's shoe size is 10");
    expect(first).toBe(second);
  });
});
