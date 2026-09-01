// Characterization tests for the Module 1 repository layer (D-117). These
// don't exercise real Postgres/RLS (see supabase/tests/pglite/rls.test.ts
// for that) -- they pin down the exact filter/order/limit chain each finder
// builds, mirroring the "fake Supabase client" style in contact.test.ts.
import { describe, expect, it } from "vitest";
import {
  getProfileDetailsForPerson,
  listConversationLogForPerson,
  listMomentsForHousehold,
  listMomentsForPerson,
  listOutstandingPromisesForHousehold,
  listReciprocityEntriesForPerson,
  listRelationshipsForPerson,
  listWishlistItemsForPerson,
  upsertProfileDetailsForPerson,
} from "./relationship-gift-engine";

type Call = { method: string; args: unknown[] };

/** Fake chainable query builder for the `list`/`getById`-style read paths. */
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
    contains: (...args: unknown[]) => {
      calls.push({ method: "contains", args });
      return builder;
    },
    is: (...args: unknown[]) => {
      calls.push({ method: "is", args });
      return builder;
    },
    maybeSingle: () => {
      calls.push({ method: "maybeSingle", args: [] });
      return Promise.resolve({ data: rows[0] ?? null, error: null });
    },
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
  };
  const client = {
    from: (table: string) => {
      tableName = table;
      return { select: () => builder };
    },
  };
  return {
    client,
    calls,
    table: () => tableName,
  };
}

/** Fake client for the single upsert call `upsertProfileDetailsForPerson` makes. */
function makeUpsertClient() {
  const calls: { table: string; values: Record<string, unknown>; opts: unknown }[] = [];
  const client = {
    from: (table: string) => ({
      upsert: (values: Record<string, unknown>, opts: unknown) => {
        calls.push({ table, values, opts });
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: "new-id", ...values }, error: null }),
          }),
        };
      },
    }),
  };
  return { client, calls };
}

describe("getProfileDetailsForPerson", () => {
  it("returns null when the person has no profile-details row yet", async () => {
    const { client } = makeListClient([]);
    const result = await getProfileDetailsForPerson(client as never, "person-1");
    expect(result).toBeNull();
  });

  it("returns the row via maybeSingle when one exists", async () => {
    const row = { person_id: "person-1", food_preferences: "Thai food" };
    const { client, calls } = makeListClient([row]);
    const result = await getProfileDetailsForPerson(client as never, "person-1");
    expect(result).toEqual(row);
    expect(calls.map((c) => c.method)).toEqual(["eq", "maybeSingle"]);
    expect(calls[0].args).toEqual(["person_id", "person-1"]);
  });
});

describe("upsertProfileDetailsForPerson", () => {
  it("upserts with person_id merged in and conflicts on person_id (create-or-update semantics)", async () => {
    const { client, calls } = makeUpsertClient();
    const result = await upsertProfileDetailsForPerson(client as never, "person-1", {
      food_preferences: "Thai food",
      clothing_size: null,
      shoe_size: null,
      ring_size: null,
      preferred_brands: null,
      how_we_met: null,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("person_profile_details");
    expect(calls[0].values).toMatchObject({ person_id: "person-1", food_preferences: "Thai food" });
    expect(calls[0].opts).toEqual({ onConflict: "person_id" });
    expect(result).toMatchObject({ person_id: "person-1", food_preferences: "Thai food" });
  });
});

describe("listWishlistItemsForPerson", () => {
  it("filters to is_active=true by default (soft-delete convention)", async () => {
    const { client, calls, table } = makeListClient([]);
    await listWishlistItemsForPerson(client as never, "person-1");
    expect(table()).toBe("person_wishlist_items");
    expect(calls).toEqual([
      { method: "eq", args: ["person_id", "person-1"] },
      { method: "eq", args: ["is_active", true] },
      { method: "order", args: ["noted_at", { ascending: false }] },
    ]);
  });

  it("skips the is_active filter when includeInactive is true", async () => {
    const { client, calls } = makeListClient([]);
    await listWishlistItemsForPerson(client as never, "person-1", { includeInactive: true });
    expect(calls).toEqual([
      { method: "eq", args: ["person_id", "person-1"] },
      { method: "order", args: ["noted_at", { ascending: false }] },
    ]);
  });
});

describe("listRelationshipsForPerson", () => {
  it("scopes to the person and orders oldest-first", async () => {
    const { client, calls, table } = makeListClient([]);
    await listRelationshipsForPerson(client as never, "person-1");
    expect(table()).toBe("person_relationships");
    expect(calls).toEqual([
      { method: "eq", args: ["person_id", "person-1"] },
      { method: "order", args: ["created_at", { ascending: true }] },
    ]);
  });
});

describe("listConversationLogForPerson", () => {
  it("defaults to the most recent 20 entries, newest first", async () => {
    const { client, calls, table } = makeListClient([]);
    await listConversationLogForPerson(client as never, "person-1");
    expect(table()).toBe("conversation_log_entries");
    expect(calls).toEqual([
      { method: "eq", args: ["person_id", "person-1"] },
      { method: "order", args: ["entry_date", { ascending: false }] },
      { method: "limit", args: [20] },
    ]);
  });

  it("respects a custom limit", async () => {
    const { client, calls } = makeListClient([]);
    await listConversationLogForPerson(client as never, "person-1", 5);
    expect(calls).toContainEqual({ method: "limit", args: [5] });
  });
});

describe("listMomentsForHousehold", () => {
  it("scopes to the household, newest-first, capped at 50 by default", async () => {
    const { client, calls, table } = makeListClient([]);
    await listMomentsForHousehold(client as never, "household-1");
    expect(table()).toBe("moments");
    expect(calls).toEqual([
      { method: "eq", args: ["household_id", "household-1"] },
      { method: "order", args: ["occurred_on", { ascending: false }] },
      { method: "limit", args: [50] },
    ]);
  });
});

describe("listMomentsForPerson", () => {
  it("scopes to the household AND filters to moments containing the person, no limit", async () => {
    const { client, calls } = makeListClient([]);
    await listMomentsForPerson(client as never, "household-1", "person-1");
    expect(calls).toEqual([
      { method: "eq", args: ["household_id", "household-1"] },
      { method: "contains", args: ["participant_person_ids", ["person-1"]] },
      { method: "order", args: ["occurred_on", { ascending: false }] },
    ]);
  });
});

describe("listReciprocityEntriesForPerson", () => {
  it("scopes to the person, newest-created-first", async () => {
    const { client, calls, table } = makeListClient([]);
    await listReciprocityEntriesForPerson(client as never, "person-1");
    expect(table()).toBe("gift_reciprocity_entries");
    expect(calls).toEqual([
      { method: "eq", args: ["person_id", "person-1"] },
      { method: "order", args: ["created_at", { ascending: false }] },
    ]);
  });
});

describe("listOutstandingPromisesForHousehold", () => {
  it("filters to unfulfilled promises for the household, soonest-due first", async () => {
    const { client, calls } = makeListClient([]);
    await listOutstandingPromisesForHousehold(client as never, "household-1");
    expect(calls).toEqual([
      { method: "eq", args: ["household_id", "household-1"] },
      { method: "eq", args: ["is_promise", true] },
      { method: "is", args: ["fulfilled_at", null] },
      { method: "order", args: ["promise_due_date", { ascending: true }] },
    ]);
  });
});
