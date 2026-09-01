import { describe, expect, it } from "vitest";
import { FEATURE_FLAGS, isFeatureEnabled, listFeatureFlagStates, setFeatureFlag } from "./flags";
import type { FeatureFlagRow } from "./db/database.types";

/**
 * Minimal fake mirroring the exact chain shapes getFeatureFlagRow (select
 * .eq.eq.maybeSingle), listFeatureFlagsForHousehold (select.eq via
 * createRepository's list()), and featureFlagsRepo.upsert build against a
 * real Supabase client -- enough to drive lib/flags.ts's real functions
 * without a live database.
 */
function fakeClient(existingRows: FeatureFlagRow[]) {
  const upserts: Record<string, unknown>[] = [];
  const client = {
    from: () => ({
      select: () => ({
        eq: (col1: string, val1: string) => ({
          eq: (col2: string, val2: string) => ({
            maybeSingle: () =>
              Promise.resolve({
                data:
                  existingRows.find(
                    (r) => (r as never as Record<string, unknown>)[col1] === val1 && (r as never as Record<string, unknown>)[col2] === val2
                  ) ?? null,
                error: null,
              }),
          }),
        }),
      }),
      upsert: (values: Record<string, unknown>) => {
        upserts.push(values);
        return {
          select: () => ({
            single: () => Promise.resolve({ data: values, error: null }),
          }),
        };
      },
    }),
  };
  return { client, upserts };
}

const baseRow: FeatureFlagRow = {
  id: "flag-1",
  household_id: "house-1",
  flag_key: "relationship_gift_engine_v2",
  enabled: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("isFeatureEnabled", () => {
  it("returns false when no row exists for the household+flag (default-off, matches Additive Contract)", async () => {
    const { client } = fakeClient([]);
    const enabled = await isFeatureEnabled(client as never, "house-1", "relationship_gift_engine_v2");
    expect(enabled).toBe(false);
  });

  it("returns true when an enabled row exists", async () => {
    const { client } = fakeClient([baseRow]);
    const enabled = await isFeatureEnabled(client as never, "house-1", "relationship_gift_engine_v2");
    expect(enabled).toBe(true);
  });

  it("returns false when the row exists but is disabled", async () => {
    const { client } = fakeClient([{ ...baseRow, enabled: false }]);
    const enabled = await isFeatureEnabled(client as never, "house-1", "relationship_gift_engine_v2");
    expect(enabled).toBe(false);
  });
});

describe("listFeatureFlagStates", () => {
  it("includes every registered flag key, defaulting missing ones to false", async () => {
    const states = await listFeatureFlagStates(
      { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [baseRow], error: null }) }) }) } as never,
      "house-1"
    );
    expect(Object.keys(states).sort()).toEqual(Object.keys(FEATURE_FLAGS).sort());
    expect(states.relationship_gift_engine_v2).toBe(true);
    expect(states.leisure_planner_v2).toBe(false);
  });
});

describe("setFeatureFlag", () => {
  it("upserts on the household_id,flag_key composite key", async () => {
    const { client, upserts } = fakeClient([]);
    await setFeatureFlag(client as never, "house-1", "leisure_planner_v2", true);
    expect(upserts).toEqual([{ household_id: "house-1", flag_key: "leisure_planner_v2", enabled: true }]);
  });
});
