// D-135: buildTravelingPlanMarkdown is the deterministic (non-AI) nudge the
// weekend planner shows instead of a local activity recommendation when a
// household member's time off overlaps the target weekend. Pure function,
// so it's tested directly rather than through the full generateWeekendPlan
// integration (which needs a live DB/AI client for the rest of its path).
import { describe, expect, it } from "vitest";
import { buildTravelingPlanMarkdown } from "./generate";
import type { PersonRow, TimeOffEntryRow } from "../db/database.types";

const saturday = new Date(2026, 8, 5); // Sat Sep 5, 2026
const sunday = new Date(2026, 8, 6); // Sun Sep 6, 2026

function person(overrides: Partial<PersonRow>): PersonRow {
  return { id: "person-1", full_name: "Richard Smith", nickname: null, ...overrides } as PersonRow;
}

function timeOff(overrides: Partial<TimeOffEntryRow>): TimeOffEntryRow {
  return {
    id: "entry-1",
    person_id: "person-1",
    start_date: "2026-09-05",
    end_date: "2026-09-06",
    reason: "",
    destination: null,
    source: "manual",
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  } as TimeOffEntryRow;
}

describe("buildTravelingPlanMarkdown", () => {
  it("mentions the person, dates, and destination when all are known", () => {
    const md = buildTravelingPlanMarkdown(
      [timeOff({ destination: "Los Angeles, CA", reason: "Vacation" })],
      [person({})],
      saturday,
      sunday
    );
    expect(md).toContain("Richard Smith");
    expect(md).toContain("Los Angeles, CA");
    expect(md).toContain("Vacation");
    expect(md).toContain("Sep 5");
    expect(md).toContain("Sep 6");
  });

  it("still produces a nudge with no destination or reason on file", () => {
    const md = buildTravelingPlanMarkdown([timeOff({})], [person({})], saturday, sunday);
    expect(md).toContain("Richard Smith");
    expect(md).not.toContain("heading to");
    expect(md.toLowerCase()).toContain("away");
  });

  it("prefers a nickname over the full name when set", () => {
    const md = buildTravelingPlanMarkdown([timeOff({})], [person({ nickname: "Rich" })], saturday, sunday);
    expect(md).toContain("Rich");
    expect(md).not.toContain("Richard Smith");
  });

  it("falls back to a generic label when the person can't be found", () => {
    const md = buildTravelingPlanMarkdown([timeOff({ person_id: "unknown-person" })], [person({})], saturday, sunday);
    expect(md).toContain("Someone in your household");
  });

  it("lists every traveling household member, sorted by start date", () => {
    const md = buildTravelingPlanMarkdown(
      [
        timeOff({ id: "e2", person_id: "person-2", start_date: "2026-09-06", end_date: "2026-09-06" }),
        timeOff({ id: "e1", person_id: "person-1", start_date: "2026-09-05", end_date: "2026-09-05" }),
      ],
      [person({ id: "person-1", full_name: "Richard Smith" }), person({ id: "person-2", full_name: "Melissa Smith" })],
      saturday,
      sunday
    );
    const richardIndex = md.indexOf("Richard Smith");
    const melissaIndex = md.indexOf("Melissa Smith");
    expect(richardIndex).toBeGreaterThan(-1);
    expect(melissaIndex).toBeGreaterThan(-1);
    expect(richardIndex).toBeLessThan(melissaIndex);
  });
});
