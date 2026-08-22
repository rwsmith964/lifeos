// Runs the REAL LifeOS migrations + seed data against PGlite (an in-process
// WASM Postgres — no Docker, no Supabase CLI, no external service). This
// exists because this project's dev environment has neither Docker nor the
// Supabase CLI available (see DECISIONS.md D-002) — it does NOT replace
// `supabase db reset` + `pnpm db:test` (the real pgTAP suite in
// supabase/tests/database/), which remains the source of truth once a real
// Supabase project is reachable. This harness is what actually caught a
// real RLS bug (D-026) that the never-executed pgTAP file could not catch
// on its own, simply by being run.
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const MIGRATIONS_DIR = path.join(REPO_ROOT, "supabase/migrations");
const SEED_FILE = path.join(REPO_ROOT, "supabase/seed.sql");
const BOOTSTRAP_FILE = path.join(__dirname, "bootstrap-auth-shim.sql");

const PGCRYPTO_EXTENSION_LINE = 'create extension if not exists "pgcrypto";';
const PGCRYPTO_SKIP_COMMENT =
  "-- (pgcrypto skipped: not available in PGlite; gen_random_uuid() is core in PG13+)";

/** Builds a fresh in-memory Postgres with the real schema + seed data loaded. */
export async function createSeededDatabase(): Promise<PGlite> {
  const db = new PGlite();

  await db.exec(fs.readFileSync(BOOTSTRAP_FILE, "utf8"));

  const migrationFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of migrationFiles) {
    let sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    if (sql.includes(PGCRYPTO_EXTENSION_LINE)) {
      sql = sql.replace(PGCRYPTO_EXTENSION_LINE, PGCRYPTO_SKIP_COMMENT);
    }
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`Migration ${file} failed against PGlite: ${(error as Error).message}`);
    }
  }

  const seedSql = fs.readFileSync(SEED_FILE, "utf8");
  await db.exec(seedSql);

  return db;
}

/** Runs `fn` as though the request came from `userId` through PostgREST (RLS enforced). */
export async function asUser<T>(db: PGlite, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.exec("begin;");
  await db.exec("set local role authenticated;");
  await db.query("select set_config('request.jwt.claims', $1, true);", [JSON.stringify({ sub: userId })]);
  try {
    return await fn();
  } finally {
    await db.exec("commit;");
  }
}

/** Runs `fn` with the service-role key (bypasses RLS) — for seeding test fixtures. */
export async function asServiceRole<T>(db: PGlite, fn: () => Promise<T>): Promise<T> {
  await db.exec("begin;");
  await db.exec("set local role service_role;");
  try {
    return await fn();
  } finally {
    await db.exec("commit;");
  }
}
