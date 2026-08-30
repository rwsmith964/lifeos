import { describe, expect, it } from "vitest";
import { buildTemplatedBriefContent } from "./template-fallback";
import type { BriefContextInput } from "../ai/prompts/brief";

const EMPTY_CTX: BriefContextInput = {
  todayLabel: "Tuesday, August 25",
  events: [],
  giftReminders: [],
  overdueContacts: [],
  prepObligations: [],
  birthdays: [],
  weather: null,
  weekendPlanSummary: null,
};

describe("buildTemplatedBriefContent", () => {
  it("produces a 'nothing notable' headline for a genuinely empty day", () => {
    const content = buildTemplatedBriefContent(EMPTY_CTX);
    expect(content.headline).toBe("Nothing notable today.");
    expect(content.today).toEqual([]);
    expect(content.headsUp).toEqual([]);
    expect(content.people).toEqual([]);
  });

  it("includes only today's events, not tomorrow's, in the today array", () => {
    const content = buildTemplatedBriefContent({
      ...EMPTY_CTX,
      events: [
        { time: "9:00 AM", title: "Golf", eventType: "personal", travelNote: null, isTomorrow: false },
        { time: "6:00 PM", title: "Dinner", eventType: "family", travelNote: null, isTomorrow: true },
      ],
    });
    expect(content.today).toEqual([{ time: "9:00 AM", title: "Golf", note: null }]);
  });

  it("turns gift reminders and prep obligations into headsUp items", () => {
    const content = buildTemplatedBriefContent({
      ...EMPTY_CTX,
      giftReminders: [
        {
          personLabel: "Dave Wilson",
          occasionType: "birthday",
          occasionDate: "2026-09-08",
          orderByDate: "2026-09-01",
          daysUntilOrderBy: 3,
        },
      ],
      prepObligations: [{ activityTitle: "Fly fishing", prepAtLabel: "Friday evening" }],
    });
    expect(content.headsUp).toHaveLength(2);
    expect(content.headsUp[0].title).toContain("Order by");
    expect(content.headsUp[1].title).toContain("Prep: Fly fishing");
  });

  it("turns an upcoming birthday into a headsUp item with the exact given timing", () => {
    const content = buildTemplatedBriefContent({
      ...EMPTY_CTX,
      birthdays: [{ personLabel: "Cal", age: 8, daysUntil: 3, timingLabel: "in 3 days" }],
    });
    expect(content.headsUp).toEqual([{ title: "Cal's birthday", detail: "Coming up in 3 days — turning 8." }]);
  });

  it("turns a just-passed birthday into a past-tense headsUp item, never dropped", () => {
    const content = buildTemplatedBriefContent({
      ...EMPTY_CTX,
      birthdays: [{ personLabel: "Cal", age: 8, daysUntil: -3, timingLabel: "3 days ago" }],
    });
    expect(content.headsUp).toEqual([{ title: "Cal's birthday", detail: "Was 3 days ago — turned 8." }]);
  });

  it("turns overdue contacts into people items with a concrete reason", () => {
    const content = buildTemplatedBriefContent({
      ...EMPTY_CTX,
      overdueContacts: [{ personLabel: "Mike Johnson", daysSinceLastContact: 45, activityType: "golf" }],
    });
    expect(content.people).toEqual([{ personLabel: "Mike Johnson", reason: "45 days since last contact" }]);
  });

  it("passes weather through unchanged", () => {
    const weather = { summary: "Sunny", highF: 78, lowF: 52 };
    const content = buildTemplatedBriefContent({ ...EMPTY_CTX, weather });
    expect(content.weather).toEqual(weather);
  });

  it("never includes a suggestion (that's an AI-only field)", () => {
    const content = buildTemplatedBriefContent(EMPTY_CTX);
    expect(content.suggestion).toBeNull();
  });
});
