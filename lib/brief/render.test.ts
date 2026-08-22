import { describe, expect, it } from "vitest";
import { renderBriefMarkdown } from "./render";
import type { BriefContent } from "./schema";

const EMPTY: BriefContent = {
  headline: "Quiet day.",
  today: [],
  headsUp: [],
  people: [],
  suggestion: null,
  weather: null,
};

describe("renderBriefMarkdown", () => {
  it("always includes the headline", () => {
    expect(renderBriefMarkdown(EMPTY)).toBe("## Quiet day.");
  });

  it("renders today items with time and note", () => {
    const content: BriefContent = {
      ...EMPTY,
      today: [{ time: "9:00 AM", title: "Golf with Mike", note: "15 min drive" }],
    };
    const md = renderBriefMarkdown(content);
    expect(md).toContain("**Today:**");
    expect(md).toContain("- 9:00 AM — Golf with Mike (15 min drive)");
  });

  it("renders an all-day item without a time prefix", () => {
    const content: BriefContent = { ...EMPTY, today: [{ time: null, title: "Jack's birthday" }] };
    expect(renderBriefMarkdown(content)).toContain("- Jack's birthday");
  });

  it("renders heads-up items with bolded title", () => {
    const content: BriefContent = {
      ...EMPTY,
      headsUp: [{ title: "Order by Thursday", detail: "Dave's birthday gift ships in 5 days" }],
    };
    expect(renderBriefMarkdown(content)).toContain(
      "- **Order by Thursday** — Dave's birthday gift ships in 5 days"
    );
  });

  it("renders people items with reason", () => {
    const content: BriefContent = {
      ...EMPTY,
      people: [{ personLabel: "Mike Johnson", reason: "45 days since your last round" }],
    };
    expect(renderBriefMarkdown(content)).toContain("- Mike Johnson: 45 days since your last round");
  });

  it("renders a suggestion when present", () => {
    const content: BriefContent = {
      ...EMPTY,
      suggestion: { title: "Call Mike", detail: "You haven't golfed since June" },
    };
    expect(renderBriefMarkdown(content)).toContain("**Suggestion:** Call Mike — You haven't golfed since June");
  });

  it("omits the suggestion section entirely when null", () => {
    expect(renderBriefMarkdown(EMPTY)).not.toContain("Suggestion");
  });

  it("renders weather with both high and low", () => {
    const content: BriefContent = {
      ...EMPTY,
      weather: { summary: "Sunny", highF: 78.4, lowF: 52.1 },
    };
    const md = renderBriefMarkdown(content);
    expect(md).toContain("**Weather:** Sunny (High 78°F, Low 52°F)");
  });

  it("renders weather with only a summary when temps are unknown", () => {
    const content: BriefContent = { ...EMPTY, weather: { summary: "Data unavailable", highF: null, lowF: null } };
    expect(renderBriefMarkdown(content)).toContain("**Weather:** Data unavailable");
    expect(renderBriefMarkdown(content)).not.toContain("(High");
  });

  it("produces just the headline for a genuinely quiet day (Section 8.4)", () => {
    expect(renderBriefMarkdown(EMPTY)).toBe("## Quiet day.");
  });
});
