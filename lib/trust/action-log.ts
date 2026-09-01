// Module 3 trust layer (D-119, universal_intake_v2 flag): a write-through
// wrapper around existing mutation functions, per the brief's exact
// framing -- "every autonomous action records what it read, what it
// decided, what it changed, and offers one-tap undo. Implemented as a
// write-through wrapper around existing mutation functions, read-only
// with respect to everything else."
//
// Acceptance criterion this file exists to satisfy: "with trust_log off,
// mutation functions behave exactly as before -- the wrapper must be a
// no-op, not a conditional branch inside business logic." The flag check
// below happens exactly once, at the top of withActionLog, entirely
// outside the mutationFn callback it wraps -- the wrapped function itself
// (executeAction, peopleRepo.create, momentsRepo.create, ...) never sees
// this flag and is never touched by this file. Flag off => this file
// calls mutationFn and returns; flag on => it also writes one action_log
// row. There is no third code path and no branch inside any business
// logic function.
import type { SupabaseClient } from "@supabase/supabase-js";
import { isFeatureEnabled } from "../flags";
import { actionLogRepo } from "../db/repositories/action-log";

export interface ActionLogSpec<T> {
  householdId: string;
  /** Free-text feature key, e.g. "quick_capture", "intake_convert". */
  feature: string;
  actor?: "ai" | "system";
  /** Short human-readable, already-done-tense summary -- never a raw enum
   * or JSON blob (standing ground rule). Called AFTER mutationFn runs, so
   * it can reference the result. */
  describe: (result: T) => string;
  /** What was read/considered before deciding, for inspection -- not
   * shown to the user directly. */
  readSummary?: Record<string, unknown>;
  /** Why a non-obvious choice was made, if any. */
  decisionSummary?: string;
  tableName: string;
  recordIdOf: (result: T) => string | null;
  /** Row state before the write, for update-in-place mutations (null/omit
   * for an insert -- nothing existed before). */
  beforeSnapshot?: Record<string, unknown> | null;
  /** Row state after the write. Defaults to `result` cast to a plain
   * object when the mutation function itself returns the written row
   * (true for every repo.create/update call) -- pass explicitly when it
   * doesn't (e.g. executeAction's void return, see lib/intake/convert.ts). */
  afterSnapshot?: (result: T) => Record<string, unknown> | null;
  undoable?: boolean;
}

/**
 * Run `mutationFn`, and when universal_intake_v2 is enabled for this
 * household, additionally record one action_log row describing the
 * write. Returns exactly what `mutationFn` returns either way.
 *
 * This wrapper is READ-ONLY with respect to everything except the new
 * action_log table -- it never touches the record mutationFn wrote, only
 * reads back what mutationFn itself returned.
 */
export async function withActionLog<T>(client: SupabaseClient, spec: ActionLogSpec<T>, mutationFn: () => Promise<T>): Promise<T> {
  const enabled = await isFeatureEnabled(client, spec.householdId, "universal_intake_v2");
  const result = await mutationFn();
  if (!enabled) return result;

  const afterSnapshot = spec.afterSnapshot ? spec.afterSnapshot(result) : (result as unknown as Record<string, unknown> | null);

  await actionLogRepo.create(client, {
    household_id: spec.householdId,
    actor: spec.actor ?? "ai",
    feature: spec.feature,
    action_summary: spec.describe(result),
    read_summary: spec.readSummary ?? {},
    decision_summary: spec.decisionSummary ?? null,
    table_name: spec.tableName,
    record_id: spec.recordIdOf(result),
    before_snapshot: spec.beforeSnapshot ?? null,
    after_snapshot: afterSnapshot,
    undoable: spec.undoable ?? false,
  });

  return result;
}
