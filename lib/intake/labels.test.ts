import { describe, expect, it } from "vitest";
import { formatFieldValue, labelForField, RECORD_TYPE_LABELS, SOURCE_TYPE_LABELS } from "./labels";

describe("labelForField", () => {
  it("returns the curated label for a known key", () => {
    expect(labelForField("eventTitle")).toBe("Title");
    expect(labelForField("giftCostDollars")).toBe("Estimated cost");
  });

  it("humanizes an unknown camelCase key rather than showing it raw", () => {
    expect(labelForField("someNewFieldKey")).toBe("Some new field key");
  });
});

describe("formatFieldValue", () => {
  it("never renders null/undefined/empty as a raw value", () => {
    expect(formatFieldValue("notes", null)).toBe("—");
    expect(formatFieldValue("notes", undefined)).toBe("—");
    expect(formatFieldValue("notes", "")).toBe("—");
  });

  it("renders booleans as Yes/No, never the literal true/false", () => {
    expect(formatFieldValue("eventAllDay", true)).toBe("Yes");
    expect(formatFieldValue("eventAllDay", false)).toBe("No");
  });

  it("formats a dollar-cost field with a leading $", () => {
    expect(formatFieldValue("giftCostDollars", 42.5)).toBe("$42.50");
  });

  it("passes through a plain string value", () => {
    expect(formatFieldValue("fullName", "Jordan Smith")).toBe("Jordan Smith");
  });
});

describe("record type and source type labels", () => {
  it("covers every detected_record_type value with a human label", () => {
    for (const key of ["calendar_event", "gift_idea", "person", "moment", "person_note", "task", "recipe", "ambiguous"] as const) {
      expect(RECORD_TYPE_LABELS[key]).toBeTruthy();
    }
  });

  it("covers every source_type value with a human label", () => {
    for (const key of ["text", "voice", "ics", "image", "screenshot", "pdf", "email"] as const) {
      expect(SOURCE_TYPE_LABELS[key]).toBeTruthy();
    }
  });
});
