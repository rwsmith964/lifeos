import { describe, expect, it } from "vitest";
import { createFakeSupabaseClient } from "../test-support/fake-supabase";
import { buildAmbientView } from "./build-ambient-view";

const HOUSEHOLD_ID = "20000000-0000-0000-0000-000000000001";
const SELF_PERSON_ID = "10000000-0000-0000-0000-000000000001";
const NOW = new Date("2026-09-01T15:00:00Z");

function person(overrides: Record<string, unknown>) {
  return {
    id: "person-1",
    household_id: HOUSEHOLD_ID,
    full_name: "Someone",
    relationship_type: "friend",
    birthdate: null,
    anniversary: null,
    is_archived: false,
    ...overrides,
  };
}

function event(overrides: Record<string, unknown>) {
  return {
    id: "evt-1",
    household_id: HOUSEHOLD_ID,
    title: "Untitled",
    starts_at: "2026-09-01T18:00:00Z",
    ends_at: "2026-09-01T19:00:00Z",
    all_day: false,
    ...overrides,
  };
}

function brief(overrides: Record<string, unknown>) {
  return {
    id: "brief-1",
    for_person_id: SELF_PERSON_ID,
    brief_date: "2026-09-01",
    generated_at: "2026-09-01T13:00:00Z",
    content_json: {
      headline: "A calm Tuesday",
      today: [{ time: "6:00 PM", title: "Dinner with Mel", note: null }],
      headsUp: [{ title: "Cal's birthday", detail: "In 5 days" }],
      people: [],
      suggestion: null,
      weather: { summary: "Partly cloudy", highF: 78, lowF: 56 },
    },
    ...overrides,
  };
}

describe("buildAmbientView", () => {
  it("makes no write calls of any kind — acceptance criterion for Module 5", async () => {
    const { client, calls } = createFakeSupabaseClient({
      briefs: { rows: [brief({})] },
      calendar_events: { rows: [event({})] },
      people: {
        rows: [
          person({ id: "p1", full_name: "Cal", birthdate: "2020-09-06" }), // 5 days out from NOW
        ],
      },
      opportunities: { rows: [] },
    });

    await buildAmbientView(client as never, HOUSEHOLD_ID, "Smith Household", SELF_PERSON_ID, NOW);

    expect(calls.length).toBeGreaterThan(0); // sanity: it actually read something
    for (const call of calls) {
      expect(call.op).toBe("select");
    }
  });

  it("surfaces the existing brief's headline, today items, heads-up, and weather when a brief exists", async () => {
    const { client } = createFakeSupabaseClient({
      briefs: { rows: [brief({})] },
      calendar_events: { rows: [] },
      people: { rows: [] },
      opportunities: { rows: [] },
    });

    const view = await buildAmbientView(client as never, HOUSEHOLD_ID, "Smith Household", SELF_PERSON_ID, NOW);

    expect(view.briefAvailable).toBe(true);
    expect(view.headline).toBe("A calm Tuesday");
    expect(view.todayItems).toHaveLength(1);
    expect(view.headsUp).toHaveLength(1);
    expect(view.weather?.summary).toBe("Partly cloudy");
  });

  it("reports briefAvailable: false without ever attempting to generate one, when no brief row exists yet today", async () => {
    const { client } = createFakeSupabaseClient({
      briefs: { rows: [] },
      calendar_events: { rows: [] },
      people: { rows: [] },
      opportunities: { rows: [] },
    });

    const view = await buildAmbientView(client as never, HOUSEHOLD_ID, "Smith Household", SELF_PERSON_ID, NOW);

    expect(view.briefAvailable).toBe(false);
    expect(view.headline).toBeNull();
    expect(view.todayItems).toEqual([]);
  });

  it("includes upcoming birthdays/anniversaries but filters out the always-present Christmas candidate", async () => {
    const { client } = createFakeSupabaseClient({
      briefs: { rows: [] },
      calendar_events: { rows: [] },
      people: {
        rows: [
          person({ id: "p1", full_name: "Cal", birthdate: "2020-09-06" }),
          person({ id: "p2", full_name: "Jen", anniversary: "2019-09-10" }),
        ],
      },
      opportunities: { rows: [] },
    });

    const view = await buildAmbientView(client as never, HOUSEHOLD_ID, "Smith Household", SELF_PERSON_ID, NOW);

    const labels = view.upcomingOccasions.map((o) => `${o.personName}:${o.occasionLabel}`);
    expect(labels).toContain("Cal:Birthday");
    expect(labels).toContain("Jen:Anniversary");
    expect(labels.some((l) => l.includes("Christmas"))).toBe(false);
  });

  it("caps outstanding items and reports overflow count", async () => {
    const opportunityRows = Array.from({ length: 8 }, (_, i) => ({
      id: `opp-${i}`,
      household_id: HOUSEHOLD_ID,
      activity_id: `act-${i}`,
      trip_idea_id: null,
      opportunity_type: "activity_window",
      for_date: "2026-09-03",
      score: 90 - i, // distinct scores so dedupe/tiering keeps all of them
      headline: `Opportunity ${i}`,
      reasoning: "Good conditions",
      status: "open",
      detected_at: "2026-09-01T00:00:00Z",
      expires_at: "2026-09-10T00:00:00Z",
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
      score_breakdown: null,
      activity: { activity_type: `activity-${i}` },
      trip_idea: null,
    }));

    const { client } = createFakeSupabaseClient({
      briefs: { rows: [] },
      calendar_events: { rows: [] },
      people: { rows: [] },
      opportunities: { rows: opportunityRows },
    });

    const view = await buildAmbientView(client as never, HOUSEHOLD_ID, "Smith Household", SELF_PERSON_ID, NOW);

    // getPresentedOpportunities has its own cap (MAX_PRESENTED_OPPORTUNITIES = 5)
    // upstream of this module's own MAX_LIST_ITEMS, so outstandingCount here
    // reflects whatever it decided to keep — this test only pins down that
    // build-ambient-view's own display cap and overflow math are consistent
    // with whatever count comes back.
    expect(view.outstandingHeadlines.length).toBeLessThanOrEqual(5);
    expect(view.outstandingCount).toBe(view.outstandingHeadlines.length + view.outstandingOverflow);
  });
});
