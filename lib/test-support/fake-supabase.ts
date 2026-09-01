// Shared fake Supabase client builder for characterization/unit tests that
// exercise repository functions (createRepository's create/update/upsert/
// list/getById) without touching real Postgres/RLS. Real integration/RLS
// coverage lives in supabase/tests/pglite/rls.test.ts; this is for pinning
// down exact call shapes and business logic, same spirit as the
// fake-chainable-client already inlined in
// lib/db/repositories/leisure-planner.test.ts and
// relationship-gift-engine.test.ts -- pulled out here so Module 3's tests
// (which need insert/update/upsert, not just list) don't reinvent it.
export interface FakeCall {
  table: string;
  op: "select" | "insert" | "update" | "upsert" | "delete";
  values?: unknown;
  filters: Array<{ method: string; args: unknown[] }>;
}

export interface FakeTableConfig {
  /** Rows returned for a plain list/select query on this table. */
  rows?: unknown[];
  /** Called for insert -- returns the row `.single()` resolves to. Defaults
   * to echoing back the inserted values with a generated id. */
  onInsert?: (values: Record<string, unknown>) => Record<string, unknown>;
  /** Called for update -- receives the values and the accumulated eq()
   * filters, returns the row `.single()` resolves to. */
  onUpdate?: (values: Record<string, unknown>, filters: Array<{ method: string; args: unknown[] }>) => Record<string, unknown>;
  onUpsert?: (values: Record<string, unknown>) => Record<string, unknown>;
}

let fakeIdCounter = 0;

/**
 * Builds a minimal fake supabase client. Every call made against it (from
 * any table) is pushed onto the returned `calls` array in order, so a test
 * can assert exactly what was read/written without a real database.
 */
export function createFakeSupabaseClient(tableConfigs: Record<string, FakeTableConfig> = {}) {
  const calls: FakeCall[] = [];

  function builderFor(table: string, op: FakeCall["op"], values?: Record<string, unknown>) {
    const filters: Array<{ method: string; args: unknown[] }> = [];
    const call: FakeCall = { table, op, values, filters };
    calls.push(call);

    const config = tableConfigs[table] ?? {};

    function resolveRow(): { data: unknown; error: null } {
      if (op === "insert") {
        const row = config.onInsert
          ? config.onInsert(values ?? {})
          : { id: `fake-${table}-${++fakeIdCounter}`, ...(values ?? {}) };
        return { data: row, error: null };
      }
      if (op === "update") {
        const row = config.onUpdate ? config.onUpdate(values ?? {}, filters) : { id: "fake-updated", ...(values ?? {}) };
        return { data: row, error: null };
      }
      if (op === "upsert") {
        const row = config.onUpsert ? config.onUpsert(values ?? {}) : { id: `fake-${table}-${++fakeIdCounter}`, ...(values ?? {}) };
        return { data: row, error: null };
      }
      return { data: config.rows ?? [], error: null };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      eq: (...args: unknown[]) => {
        filters.push({ method: "eq", args });
        return builder;
      },
      order: (...args: unknown[]) => {
        filters.push({ method: "order", args });
        return builder;
      },
      limit: (...args: unknown[]) => {
        filters.push({ method: "limit", args });
        return builder;
      },
      gte: (...args: unknown[]) => {
        filters.push({ method: "gte", args });
        return builder;
      },
      select: () => builder,
      single: () => Promise.resolve(resolveRow()),
      maybeSingle: () => {
        const result = resolveRow();
        if (op === "select" && Array.isArray(result.data)) {
          return Promise.resolve({ data: result.data[0] ?? null, error: null });
        }
        return Promise.resolve(result);
      },
      then: (resolve: (v: { data: unknown; error: null }) => unknown) => resolve(resolveRow()),
    };
    return builder;
  }

  const client = {
    from: (table: string) => ({
      select: () => builderFor(table, "select"),
      insert: (values: Record<string, unknown>) => builderFor(table, "insert", values),
      update: (values: Record<string, unknown>) => builderFor(table, "update", values),
      upsert: (values: Record<string, unknown>) => builderFor(table, "upsert", values),
      delete: () => builderFor(table, "delete"),
    }),
  };

  return { client, calls };
}
