import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type { BrainDumpBatchInsert, BrainDumpBatchRow, BrainDumpBatchUpdate } from "../database.types";

export const brainDumpBatchesRepo = createRepository<BrainDumpBatchRow, BrainDumpBatchInsert, BrainDumpBatchUpdate>(
  "brain_dump_batches"
);

// P3-7: history list for the brain-dump page — most recent first, capped
// so an old household doesn't render an unbounded list.
export async function listRecentBrainDumpBatches(
  client: SupabaseClient,
  householdId: string,
  limit = 15
): Promise<BrainDumpBatchRow[]> {
  return brainDumpBatchesRepo.list(client, (q) =>
    q.eq("household_id", householdId).order("created_at", { ascending: false }).limit(limit)
  );
}

// Best-effort tally of how many items got saved out of a batch, so the
// history list can show "3 saved" instead of just the parse outcome.
// Called once per successful execute, from a request that already holds
// the batch's id — a plain read-then-write, no atomic increment RPC,
// which is fine here since saves for one batch happen sequentially from
// a single browser tab (see brain-dump-client.tsx's saveAll comment).
export async function incrementBrainDumpBatchSavedCount(client: SupabaseClient, batchId: string): Promise<void> {
  const batch = await brainDumpBatchesRepo.getById(client, batchId);
  if (!batch) return;
  await brainDumpBatchesRepo.update(client, batchId, { saved_count: batch.saved_count + 1 });
}
