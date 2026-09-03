// Characterization tests for the D-139 packing repository. Same
// fake-chainable-client style as leisure-planner.test.ts -- pins down the
// exact filter/order chain each finder builds without touching real
// Postgres/RLS (see supabase/tests/pglite/rls.test.ts for the real thing).
import { describe, expect, it } from "vitest";
import { listItemsForPackingList, listPackingListsForHousehold } from "./packing";

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

describe("listPackingListsForHousehold", () => {
  it("scopes to the household, active-first then most-recently-created", async () => {
    const { client, calls, table } = makeListClient([]);
    await listPackingListsForHousehold(client as never, "household-1");
    expect(table()).toBe("packing_lists");
    expect(calls).toEqual([
      { method: "eq", args: ["household_id", "household-1"] },
      { method: "order", args: ["status", { ascending: true }] },
      { method: "order", args: ["created_at", { ascending: false }] },
    ]);
  });
});

describe("listItemsForPackingList", () => {
  it("scopes to the list, unchecked-first then sort_order", async () => {
    const { client, calls, table } = makeListClient([]);
    await listItemsForPackingList(client as never, "list-1");
    expect(table()).toBe("packing_list_items");
    expect(calls).toEqual([
      { method: "eq", args: ["packing_list_id", "list-1"] },
      { method: "order", args: ["checked", { ascending: true }] },
      { method: "order", args: ["sort_order", { ascending: true }] },
    ]);
  });
});
