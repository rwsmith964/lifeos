import { describe, expect, it } from "vitest";
import { looksLikeDayPlan } from "./detect";

describe("looksLikeDayPlan", () => {
  it("is a day plan when most items are events", () => {
    expect(looksLikeDayPlan(["create_calendar_event", "create_calendar_event", "create_calendar_event"])).toBe(true);
    expect(looksLikeDayPlan(["create_calendar_event", "create_calendar_event", "append_person_note"])).toBe(true);
  });
  it("is not when events are a minority or there is only one", () => {
    expect(looksLikeDayPlan(["create_calendar_event", "append_person_note", "record_gift"])).toBe(false);
    expect(looksLikeDayPlan(["create_calendar_event"])).toBe(false);
    expect(looksLikeDayPlan([])).toBe(false);
  });
});
