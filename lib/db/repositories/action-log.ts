// Module 3 (D-119, universal_intake_v2 flag) -- repository layer for
// action_log (supabase/migrations/20260901000004_module3_intake_trust_layer.sql).
// Written exclusively through lib/trust/action-log.ts's withActionLog()
// wrapper -- nothing else should call actionLogRepo.create directly, so
// every row here always has a real caller-supplied summary, never a
// synthetic backfill.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type { ActionLogInsert, ActionLogRow, ActionLogUpdate } from "../database.types";

export const actionLogRepo = createRepository<ActionLogRow, ActionLogInsert, ActionLogUpdate>("action_log");

/** Every log entry in [since, now) for a household, most recent first --
 * used by lib/trust/weekly-digest.ts and any future "action log" view. */
export async function listActionLogSince(
  client: SupabaseClient,
  householdId: string,
  sinceISO: string
): Promise<ActionLogRow[]> {
  return actionLogRepo.list(client, (q) =>
    q.eq("household_id", householdId).gte("created_at", sinceISO).order("created_at", { ascending: false })
  );
}

/** Marks one entry undone (owner/adult-gated by RLS) -- callers are
 * responsible for actually reversing the underlying write first; this
 * only records that it happened. */
export async function markActionUndone(client: SupabaseClient, id: string): Promise<ActionLogRow> {
  return actionLogRepo.update(client, id, { undone_at: new Date().toISOString() });
}
