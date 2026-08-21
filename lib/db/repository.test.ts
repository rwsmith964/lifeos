import { describe, expect, it, vi } from "vitest";
import { createRepository } from "./repository";

interface FakeRow {
  id: string;
  name: string;
}

/**
 * Minimal stand-in for the Supabase query builder: every filter method
 * returns `this` for chaining, and the object is thenable so `await query`
 * resolves to `{ data, error }` — matching how postgrest-js queries work.
 * `calls` records every method invocation so tests can assert on the shape
 * of the query the repository built, without a real Postgres connection.
 */
function makeFakeQuery(result: { data: unknown; error: unknown }) {
  const calls: { method: string; args: unknown[] }[] = [];
  const chainMethods = [
    "select",
    "eq",
    "order",
    "limit",
    "gte",
    "lt",
    "lte",
    "gt",
    "is",
    "in",
    "or",
    "insert",
    "update",
    "delete",
    "upsert",
  ];

  const query: Record<string, unknown> = { calls };
  for (const method of chainMethods) {
    query[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return query;
    };
  }
  // `single`/`maybeSingle` terminate the chain by resolving directly.
  query.single = () => Promise.resolve(result);
  query.maybeSingle = () => Promise.resolve(result);
  query.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return query;
}

function makeFakeClient(result: { data: unknown; error: unknown }) {
  const query = makeFakeQuery(result);
  return {
    from: vi.fn(() => query),
    query,
  };
}

describe("createRepository", () => {
  const repo = createRepository<FakeRow, Omit<FakeRow, "id">, Partial<FakeRow>>("fake_table");

  it("list() selects from the right table and returns rows", async () => {
    const rows: FakeRow[] = [{ id: "1", name: "a" }];
    const client = makeFakeClient({ data: rows, error: null });

    const result = await repo.list(client as never);

    expect(client.from).toHaveBeenCalledWith("fake_table");
    expect(result).toEqual(rows);
  });

  it("list() applies the shape callback (filters/ordering)", async () => {
    const client = makeFakeClient({ data: [], error: null });

    await repo.list(client as never, (q) => q.eq("household_id", "abc").order("name"));

    const calls = (client.query as { calls: { method: string; args: unknown[] }[] }).calls;
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "household_id")).toBe(true);
    expect(calls.some((c) => c.method === "order")).toBe(true);
  });

  it("list() returns an empty array when data is null", async () => {
    const client = makeFakeClient({ data: null, error: null });
    const result = await repo.list(client as never);
    expect(result).toEqual([]);
  });

  it("list() throws on a Postgres error", async () => {
    const client = makeFakeClient({ data: null, error: new Error("boom") });
    await expect(repo.list(client as never)).rejects.toThrow("boom");
  });

  it("getById() filters by id and returns a single row", async () => {
    const row: FakeRow = { id: "1", name: "a" };
    const client = makeFakeClient({ data: row, error: null });

    const result = await repo.getById(client as never, "1");

    expect(result).toEqual(row);
  });

  it("getById() returns null when no row matches", async () => {
    const client = makeFakeClient({ data: null, error: null });
    const result = await repo.getById(client as never, "missing");
    expect(result).toBeNull();
  });

  it("create() inserts and returns the created row", async () => {
    const row: FakeRow = { id: "1", name: "new" };
    const client = makeFakeClient({ data: row, error: null });

    const result = await repo.create(client as never, { name: "new" });

    expect(result).toEqual(row);
  });

  it("create() throws on a Postgres error", async () => {
    const client = makeFakeClient({ data: null, error: new Error("constraint violation") });
    await expect(repo.create(client as never, { name: "x" })).rejects.toThrow(
      "constraint violation"
    );
  });

  it("update() filters by id and returns the updated row", async () => {
    const row: FakeRow = { id: "1", name: "renamed" };
    const client = makeFakeClient({ data: row, error: null });

    const result = await repo.update(client as never, "1", { name: "renamed" });

    expect(result).toEqual(row);
  });

  it("remove() deletes by id without throwing on success", async () => {
    const client = makeFakeClient({ data: null, error: null });
    await expect(repo.remove(client as never, "1")).resolves.toBeUndefined();
  });

  it("remove() throws on a Postgres error", async () => {
    const client = makeFakeClient({ data: null, error: new Error("fk violation") });
    await expect(repo.remove(client as never, "1")).rejects.toThrow("fk violation");
  });
});
