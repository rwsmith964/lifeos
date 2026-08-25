import type { SupabaseClient } from "@supabase/supabase-js";

// `@supabase/postgrest-js` isn't a direct dependency (pnpm doesn't hoist
// transitive packages), so the query-builder type it would give us isn't
// importable here. `any` is deliberate at this one boundary — see the
// class comment below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryBuilder = any;

/**
 * Generic CRUD factory shared by every table-specific repository in
 * lib/db/repositories/. Table-specific files add their own finder methods
 * (listByHousehold, listByPerson, etc.) on top of what this returns —
 * this factory only covers the shape every table needs identically.
 *
 * Not typed against Supabase's generated `Database` schema (no codegen
 * pipeline is set up — see database.types.ts, which is hand-authored to
 * mirror the migrations). Query builder calls are typed loosely and the
 * result is cast to the hand-written Row type at the boundary, which is
 * exactly where a real schema mismatch would surface anyway (every
 * repository has a corresponding Zod-schema test in the same directory).
 */
export function createRepository<Row extends { id: string }, InsertT, UpdateT>(table: string) {
  return {
    table,

    async list(client: SupabaseClient, shape?: (query: QueryBuilder) => QueryBuilder): Promise<Row[]> {
      let query = client.from(table).select("*");
      if (shape) query = shape(query) as typeof query;
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Row[];
    },

    async getById(client: SupabaseClient, id: string): Promise<Row | null> {
      const { data, error } = await client.from(table).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Row | null;
    },

    async create(client: SupabaseClient, values: InsertT): Promise<Row> {
      const { data, error } = await client.from(table).insert(values as never).select("*").single();
      if (error) throw error;
      return data as Row;
    },

    async createMany(client: SupabaseClient, values: InsertT[]): Promise<Row[]> {
      const { data, error } = await client.from(table).insert(values as never[]).select("*");
      if (error) throw error;
      return (data ?? []) as Row[];
    },

    /**
     * Insert, or update in place on a unique-constraint conflict. Use this
     * instead of `create` for any user-facing "add" action where re-adding
     * the same logical row (e.g. the same interest, the same occasion
     * budget) is a normal thing to do, not an error — see D-032. Postgres
     * needs the actual conflicting column(s) named explicitly; there's no
     * way to upsert "whatever the table's unique index happens to be" from
     * PostgREST.
     */
    async upsert(client: SupabaseClient, values: InsertT, conflictColumns: string): Promise<Row> {
      const { data, error } = await client
        .from(table)
        .upsert(values as never, { onConflict: conflictColumns })
        .select("*")
        .single();
      if (error) throw error;
      return data as Row;
    },

    async update(client: SupabaseClient, id: string, values: UpdateT): Promise<Row> {
      const { data, error } = await client
        .from(table)
        .update(values as never)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as Row;
    },

    async remove(client: SupabaseClient, id: string): Promise<void> {
      const { error } = await client.from(table).delete().eq("id", id);
      if (error) throw error;
    },
  };
}
