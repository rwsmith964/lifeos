// Module 8 (brief_registration_v2, D-1XX): characterization tests for the
// opportunities contributor -- confirms it's a thin adapter that defers
// entirely to the existing D-061/D-070 query + presentation logic rather
// than re-deriving scoring/dedupe itself.
import { describe, expect, it } from "vitest";
import { createFakeSupabaseClient } from "../../test-support/fake-supabase";
import { opportunitiesContributor } from "./opportunities";

const HOUSEHOLD_ID = "household-1";

function joinRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "opp-1",
    household_id: HOUSEHOLD_ID,
    activity_id: "activity-1",
    trip_idea_id: null,
    opportunity_type: "activity_window",
    for_date: "2026-09-05",
    score: 85,
    headline: "Great weather for golf this weekend",
    reasoning: "Sunny, low wind, tee times open Saturday morning.",
    status: "open",
    detected_at: "2026-09-01T00:00:00.000Z",
    expires_at: "2026-09-06T00:00:00.000Z",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    score_breakdown: null,
    activity: { activity_type: "Golf at Fiddlers Green" },
    trip_idea: null,
    ...overrides,
  };
}

function ctxWith(rows: unknown[]) {
  const { client } = createFakeSupabaseClient({ opportunities: { rows } });
  return { supabase: client as never, householdId: HOUSEHOLD_ID, personId: "person-1", today: new Date("2026-09-01") };
}

describe("opportunitiesContributor", () => {
  it("maps a presented opportunity into a BriefItem carrying the same headline/reasoning/score", async () => {
    const items = await opportunitiesContributor(ctxWith([joinRow()]));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "opportunities:opp-1",
      category: "opportunities",
      priority: 85,
      title: "Great weather for golf this weekend",
      detail: "Sunny, low wind, tee times open Saturday morning.",
      href: "/opportunities",
    });
  });

  it("defers dedupe/tiering to getPresentedOpportunities -- two same-family rows collapse to one item", async () => {
    const items = await opportunitiesContributor(
      ctxWith([
        joinRow({ id: "opp-1", score: 85, for_date: "2026-09-05", activity: { activity_type: "Golf at Fiddlers Green" } }),
        joinRow({ id: "opp-2", score: 70, for_date: "2026-09-05", activity: { activity_type: "Golf at Oakway Golf Course" } }),
      ])
    );
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("opportunities:opp-1"); // higher score survives dedupe
  });

  it("returns no items when there are no open opportunities", async () => {
    expect(await opportunitiesContributor(ctxWith([]))).toEqual([]);
  });
});
