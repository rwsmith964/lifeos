// Pins down the acceptance criterion the brief states verbatim: "with
// trust_log off, mutation functions behave exactly as before -- the
// wrapper must be a no-op, not a conditional branch inside business
// logic." These tests assert that directly against the fake client's
// recorded calls, not just the return value.
import { describe, it, expect } from "vitest";
import { withActionLog, reverseAction } from "./action-log";
import { createFakeSupabaseClient } from "../test-support/fake-supabase";
import type { ActionLogRow } from "../db/database.types";

function baseRow(overrides: Partial<ActionLogRow> = {}): ActionLogRow {
  return {
    id: "log-1",
    household_id: "h1",
    actor: "ai",
    feature: "intake_convert",
    action_summary: "Added gift g1",
    read_summary: {},
    decision_summary: null,
    table_name: "gifts",
    record_id: "g1",
    before_snapshot: null,
    after_snapshot: null,
    undoable: true,
    undone_at: null,
    created_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("withActionLog", () => {
  it("is a true no-op when universal_intake_v2 is off: mutationFn still runs, but nothing is written to action_log", async () => {
    const { client, calls } = createFakeSupabaseClient({
      feature_flags: { rows: [] }, // no row => flag resolves to disabled
    });

    let mutationRan = false;
    const result = await withActionLog(
      client as never,
      {
        householdId: "h1",
        feature: "quick_capture",
        describe: () => "Added something",
        tableName: "gifts",
        recordIdOf: () => "g1",
      },
      async () => {
        mutationRan = true;
        return { id: "g1" };
      }
    );

    expect(mutationRan).toBe(true);
    expect(result).toEqual({ id: "g1" });
    expect(calls.some((c) => c.table === "action_log")).toBe(false);
  });

  it("writes exactly one action_log row when the flag is on, after mutationFn already ran", async () => {
    const { client, calls } = createFakeSupabaseClient({
      feature_flags: { rows: [{ enabled: true }] },
    });

    const order: string[] = [];
    const result = await withActionLog(
      client as never,
      {
        householdId: "h1",
        feature: "intake_convert",
        describe: (r: { id: string }) => `Added gift ${r.id}`,
        tableName: "gifts",
        recordIdOf: (r: { id: string }) => r.id,
        decisionSummary: "matched to Dave",
        undoable: true,
      },
      async () => {
        order.push("mutation");
        return { id: "g1", title: "Fishing rod" };
      }
    );
    order.push("returned");

    expect(order).toEqual(["mutation", "returned"]);
    expect(result).toEqual({ id: "g1", title: "Fishing rod" });

    const logCalls = calls.filter((c) => c.table === "action_log");
    expect(logCalls).toHaveLength(1);
    expect(logCalls[0].values).toMatchObject({
      household_id: "h1",
      feature: "intake_convert",
      action_summary: "Added gift g1",
      table_name: "gifts",
      record_id: "g1",
      decision_summary: "matched to Dave",
      undoable: true,
    });
  });

  it("propagates a mutationFn error without writing a log row, flag on or off", async () => {
    const { client, calls } = createFakeSupabaseClient({
      feature_flags: { rows: [{ enabled: true }] },
    });

    await expect(
      withActionLog(
        client as never,
        {
          householdId: "h1",
          feature: "quick_capture",
          describe: () => "unreachable",
          tableName: "gifts",
          recordIdOf: () => null,
        },
        async () => {
          throw new Error("write failed");
        }
      )
    ).rejects.toThrow("write failed");

    expect(calls.some((c) => c.table === "action_log")).toBe(false);
  });
});

describe("reverseAction", () => {
  it("deletes the record when before_snapshot is absent (the original write was an insert)", async () => {
    const { client, calls } = createFakeSupabaseClient({ gifts: {} });

    await reverseAction(client as never, baseRow({ table_name: "gifts", record_id: "g1", before_snapshot: null }));

    const deleteCalls = calls.filter((c) => c.table === "gifts" && c.op === "delete");
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].filters).toContainEqual({ method: "eq", args: ["id", "g1"] });
  });

  it("restores before_snapshot via update when the original write was an update-in-place", async () => {
    const { client, calls } = createFakeSupabaseClient({ people: {} });

    await reverseAction(
      client as never,
      baseRow({
        table_name: "people",
        record_id: "p1",
        before_snapshot: { notes: "original notes" },
      })
    );

    const updateCalls = calls.filter((c) => c.table === "people" && c.op === "update");
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].values).toEqual({ notes: "original notes" });
    expect(updateCalls[0].filters).toContainEqual({ method: "eq", args: ["id", "p1"] });
  });

  it("throws without writing anything when the row has no record_id", async () => {
    const { client, calls } = createFakeSupabaseClient({});

    await expect(reverseAction(client as never, baseRow({ record_id: null }))).rejects.toThrow(
      "This action has no associated record to undo."
    );
    expect(calls).toHaveLength(0);
  });
});
