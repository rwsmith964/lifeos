import { describe, expect, it } from "vitest";
import { summarizeBriefChanges } from "./diff-summary";
import type { BriefContent } from "./schema";

function content(overrides: Partial<BriefContent> = {}): BriefContent {
  return {
    headline: "Headline",
    today: [],
    headsUp: [],
    people: [],
    suggestion: null,
    weather: null,
    ...overrides,
  };
}

describe("summarizeBriefChanges (B6)", () => {
  it("returns null when there was no prior brief to diff against", () => {
    expect(summarizeBriefChanges(null, content())).toBeNull();
  });

  it("reports 'Nothing changed.' when nothing meaningfully differs", () => {
    const before = content({ weather: { summary: "Sunny", highF: 70, lowF: 50 } });
    const after = content({ weather: { summary: "Sunny", highF: 72, lowF: 51 } });
    expect(summarizeBriefChanges(before, after)).toBe("Nothing changed.");
  });

  it("names weather when the summary text changes", () => {
    const before = content({ weather: { summary: "Sunny", highF: 70, lowF: 50 } });
    const after = content({ weather: { summary: "Rainy", highF: 60, lowF: 45 } });
    expect(summarizeBriefChanges(before, after)).toBe("Updated: weather.");
  });

  it("names reach-outs with a count when the people array changes", () => {
    const before = content({ people: [] });
    const after = content({ people: [{ personLabel: "Jackie", reason: "9 days." }, { personLabel: "Fritz", reason: "5 days." }] });
    expect(summarizeBriefChanges(before, after)).toBe("Updated: 2 reach-outs.");
  });

  it("uses singular phrasing for exactly one reach-out", () => {
    const before = content({ people: [] });
    const after = content({ people: [{ personLabel: "Jackie", reason: "9 days." }] });
    expect(summarizeBriefChanges(before, after)).toBe("Updated: 1 reach-out.");
  });

  it("combines multiple changed sections in one summary", () => {
    const before = content({ weather: { summary: "Sunny", highF: 70, lowF: 50 }, people: [] });
    const after = content({
      weather: { summary: "Rainy", highF: 60, lowF: 45 },
      people: [{ personLabel: "Jackie", reason: "9 days." }],
    });
    expect(summarizeBriefChanges(before, after)).toBe("Updated: weather, 1 reach-out.");
  });
});
