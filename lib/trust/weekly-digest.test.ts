import { describe, it, expect } from "vitest";
import { buildWeeklyDigest } from "./weekly-digest";
import type { ActionLogRow } from "../db/database.types";

function entry(overrides: Partial<ActionLogRow>): ActionLogRow {
  return {
    id: "log-1",
    household_id: "h1",
    actor: "ai",
    feature: "quick_capture",
    action_summary: "Did something",
    read_summary: {},
    decision_summary: null,
    table_name: "gifts",
    record_id: null,
    before_snapshot: null,
    after_snapshot: null,
    undoable: false,
    undone_at: null,
    created_at: "2026-08-25T00:00:00Z",
    ...overrides,
  };
}

describe("buildWeeklyDigest", () => {
  it("reports zero actions with a plain message when the log is empty", () => {
    const digest = buildWeeklyDigest([]);
    expect(digest.totalActions).toBe(0);
    expect(digest.sections).toEqual([]);
    expect(digest.bodyText).toBe("No autonomous actions were taken this week.");
  });

  it("groups entries by feature and renders each row's own action_summary verbatim", () => {
    const entries = [
      entry({ id: "1", feature: "quick_capture", action_summary: "Added 'fly fishing' to Dave's interests" }),
      entry({ id: "2", feature: "quick_capture", action_summary: "Logged a call with Mom" }),
      entry({ id: "3", feature: "intake_convert", action_summary: "Created calendar event 'Dentist'" }),
    ];

    const digest = buildWeeklyDigest(entries);
    expect(digest.totalActions).toBe(3);
    expect(digest.sections).toHaveLength(2);

    // Most-active feature (quick_capture, 2 entries) sorts first.
    expect(digest.sections[0]).toEqual({
      feature: "quick_capture",
      count: 2,
      summaries: ["Added 'fly fishing' to Dave's interests", "Logged a call with Mom"],
    });
    expect(digest.sections[1]).toEqual({
      feature: "intake_convert",
      count: 1,
      summaries: ["Created calendar event 'Dentist'"],
    });

    expect(digest.bodyText).toContain("3 actions");
    expect(digest.bodyText).toContain("Added 'fly fishing' to Dave's interests");
  });

  it("breaks a count tie between features alphabetically for a deterministic digest", () => {
    const entries = [entry({ id: "1", feature: "zeta_feature" }), entry({ id: "2", feature: "alpha_feature" })];
    const digest = buildWeeklyDigest(entries);
    expect(digest.sections.map((s) => s.feature)).toEqual(["alpha_feature", "zeta_feature"]);
  });

  it("uses singular phrasing for exactly one action", () => {
    const digest = buildWeeklyDigest([entry({})]);
    expect(digest.bodyText).toContain("1 action)");
  });
});
