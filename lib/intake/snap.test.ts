import { describe, expect, it } from "vitest";
import { isConvertibleRecordType } from "./snap";

describe("isConvertibleRecordType", () => {
  it("accepts record types that can be added automatically", () => {
    for (const t of ["calendar_event", "gift_idea", "person", "person_note", "moment", "recipe", "flight", "task"] as const) {
      expect(isConvertibleRecordType(t)).toBe(true);
    }
  });
  it("rejects ambiguous and unclassified drafts", () => {
    expect(isConvertibleRecordType("ambiguous")).toBe(false);
    expect(isConvertibleRecordType(null)).toBe(false);
  });
});
