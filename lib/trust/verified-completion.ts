// Module 3 trust layer (D-119, universal_intake_v2 flag): "the assistant
// never asserts a task is complete based on its own say-so. Completion is
// asserted from a state check against the actual record." Per the
// inventory (inventory-module3.md), this is Quick Capture's confirmed
// gap: app/api/capture/route.ts builds its confirmationMessage from the
// AI's own pre-write summary text, never re-read from the row that was
// actually persisted.
//
// This file is read-only against the record it checks -- it never writes
// anything. Callers re-fetch the row through the repo's own getById after
// their write and pass it here.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface VerificationResult<Row> {
  verified: boolean;
  /** Field names whose persisted value didn't match what was expected, or
   * ["record_not_found"] if the row couldn't be re-read at all. */
  mismatches: string[];
  record: Row | null;
}

/**
 * Re-reads `recordId` through `getById` and compares each key in
 * `expectedFields` against the actual persisted row -- the state check
 * the brief requires instead of trusting a pre-write claim. `undefined`
 * values in `expectedFields` are skipped (the caller didn't have an
 * opinion about that field), so callers can pass a partial expectation
 * built from whatever they knew before writing.
 */
export async function verifyRecordPersisted<Row extends { id: string }>(
  client: SupabaseClient,
  getById: (client: SupabaseClient, id: string) => Promise<Row | null>,
  recordId: string,
  expectedFields: Partial<Record<keyof Row, unknown>>
): Promise<VerificationResult<Row>> {
  const record = await getById(client, recordId);
  if (!record) {
    return { verified: false, mismatches: ["record_not_found"], record: null };
  }

  const mismatches: string[] = [];
  for (const key of Object.keys(expectedFields) as (keyof Row)[]) {
    const expected = expectedFields[key];
    if (expected === undefined) continue;
    if (record[key] !== expected) mismatches.push(String(key));
  }

  return { verified: mismatches.length === 0, mismatches, record };
}

/**
 * Builds the user-facing confirmation sentence from a verification result
 * instead of an unverified AI claim. `describeRecord` renders the same
 * kind of short human-readable phrase Quick Capture already produces
 * (e.g. "Added 'fly fishing' to Dave's interests") but from the ACTUAL
 * persisted row, not the model's pre-write text.
 */
export function buildVerifiedConfirmationMessage<Row>(
  verification: VerificationResult<Row>,
  describeRecord: (record: Row) => string
): string {
  if (!verification.verified || !verification.record) {
    return "Saved, but couldn't verify all the details went through as expected -- please double-check.";
  }
  return `Saved — ${describeRecord(verification.record)}.`;
}
