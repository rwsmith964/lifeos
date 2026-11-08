import { describe, expect, it } from "vitest";
import { buildPersonLabelLookup } from "./label-lookup";
import type { PersonRow } from "../db/database.types";

function person(id: string, fullName: string, nickname: string | null = null): PersonRow {
  return { id, full_name: fullName, nickname } as PersonRow;
}

describe("buildPersonLabelLookup", () => {
  it("resolves a nickname the brief uses back to the person (the Fritz bug)", () => {
    const fritz = person("p1", "Richard Frederick Smith", "Fritz");
    const lookup = buildPersonLabelLookup([fritz]);
    expect(lookup.get("Fritz")).toBe(fritz);
    expect(lookup.get("Richard Frederick Smith")).toBe(fritz);
  });

  it("resolves a first name when it is unambiguous", () => {
    const jackie = person("p1", "Jackie Smith");
    expect(buildPersonLabelLookup([jackie]).get("Jackie")).toBe(jackie);
  });

  it("drops a key shared by two different people instead of guessing", () => {
    const a = person("p1", "Alex Smith");
    const b = person("p2", "Alex Jones");
    const lookup = buildPersonLabelLookup([a, b]);
    expect(lookup.has("Alex")).toBe(false);
    expect(lookup.get("Alex Smith")).toBe(a);
    expect(lookup.get("Alex Jones")).toBe(b);
  });

  it("does not drop a key just because one person contributes it twice", () => {
    const solo = person("p1", "Cal", "Cal");
    expect(buildPersonLabelLookup([solo]).get("Cal")).toBe(solo);
  });
});
