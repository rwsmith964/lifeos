// Characterization tests for the Module 2 repository layer (D-118). Same
// fake-chainable-client style as relationship-gift-engine.test.ts -- pins
// down the exact filter/order/limit chain each finder builds without
// touching real Postgres/RLS (see supabase/tests/pglite/rls.test.ts).
import { describe, expect, it } from "vitest";
import {
  getViabilityConfigForType,
  listGearChecklistItemsForActivity,
  listGearChecklistItemsForType,
  listOutingLogsForActivity,
  listOutingLogsForHousehold,
  listViabilityConfigsForHousehold,
} from "./leisure-planner";

type Call = { method: string; args: unknown[] };

function makeListClient(rows: unknown[]) {
  const calls: Call[] = [];
  let tableName = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    eq: (...args: unknown[]) => {
      calls.push({ method: "eq", args });
      return builder;
    },
    order: (...args: unknown[]) => {
      calls.push({ method: "order", args });
      return builder;
    },
    limit: (...args: unknown[]) => {
      calls.push({ method: "limit", args });
      return builder;
    },
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
  };
  const client = {
    from: (table: string) => {
      tableName = table;
      return { select: () => builder };
    },
  };
  return { client, calls, table: () => tableName };
}

describe("listViabilityConfigsForHousehold", () => {
  it("scopes to the household, ordered by activity_type_key", async () => {
    const { client, calls, table } = makeListClient([]);
    await listViabilityConfigsForHousehold(client as never, "household-1");
    expect(table()).toBe("activity_type_viability_configs");
    expect(calls).toEqual([
      { method: "eq", args: ["household_id", "household-1"] },
      { method: "order", args: ["activity_type_key", { ascending: true }] },
    ]);
  });
});

describe("getViabilityConfigForType", () => {
  it("filters by household and normalized type key, capped to one row", async () => {
    const { client, calls } = makeListClient([{ id: "cfg-1" }]);
    const result = await getViabilityConfigForType(client as never, "household-1", "fishing");
    expect(calls).toEqual([
      { method: "eq", args: ["household_id", "household-1"] },
      { method: "eq", args: ["activity_type_key", "fishing"] },
      { method: "limit", args: [1] },
    ]);
    expect(result).toEqual({ id: "cfg-1" });
  });

  it("returns null when no config row exists for that type", async () => {
    const { client } = makeListClient([]);
    const result = await getViabilityConfigForType(client as never, "household-1", "golf");
    expect(result).toBeNull();
  });
});

describe("listGearChecklistItemsForActivity", () => {
  it("scopes to the activity, ordered by sort_order ascending", async () => {
    const { client, calls, table } = makeListClient([]);
    await listGearChecklistItemsForActivity(client as never, "activity-1");
    expect(table()).toBe("gear_checklist_items");
    expect(calls).toEqual([
      { method: "eq", args: ["user_activity_id", "activity-1"] },
      { method: "order", args: ["sort_order", { ascending: true }] },
    ]);
  });
});

describe("listGearChecklistItemsForType", () => {
  it("scopes to household + normalized type key, ordered by sort_order", async () => {
    const { client, calls } = makeListClient([]);
    await listGearChecklistItemsForType(client as never, "household-1", "fishing");
    expect(calls).toEqual([
      { method: "eq", args: ["household_id", "household-1"] },
      { method: "eq", args: ["activity_type_key", "fishing"] },
      { method: "order", args: ["sort_order", { ascending: true }] },
    ]);
  });
});

describe("listOutingLogsForActivity", () => {
  it("scopes to the activity, newest-first, capped at 25 by default", async () => {
    const { client, calls, table } = makeListClient([]);
    await listOutingLogsForActivity(client as never, "activity-1");
    expect(table()).toBe("leisure_outing_logs");
    expect(calls).toEqual([
      { method: "eq", args: ["user_activity_id", "activity-1"] },
      { method: "order", args: ["occurred_on", { ascending: false }] },
      { method: "limit", args: [25] },
    ]);
  });

  it("respects a custom limit", async () => {
    const { client, calls } = makeListClient([]);
    await listOutingLogsForActivity(client as never, "activity-1", 5);
    expect(calls).toContainEqual({ method: "limit", args: [5] });
  });
});

describe("listOutingLogsForHousehold", () => {
  it("scopes to the household, newest-first, capped at 50 by default", async () => {
    const { client, calls, table } = makeListClient([]);
    await listOutingLogsForHousehold(client as never, "household-1");
    expect(table()).toBe("leisure_outing_logs");
    expect(calls).toEqual([
      { method: "eq", args: ["household_id", "household-1"] },
      { method: "order", args: ["occurred_on", { ascending: false }] },
      { method: "limit", args: [50] },
    ]);
  });
});
