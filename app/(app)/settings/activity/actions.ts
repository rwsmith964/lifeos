"use server";

// Server Actions for Settings > Activity (QUEUE-011 remainder: the
// action-log/undo UI Module 3's trust layer was missing a way to see or
// act on -- withActionLog (lib/trust/action-log.ts) has been writing rows
// since D-119, but nothing in the app rendered them until now).

import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { listMembersOfHousehold } from "@/lib/db/repositories/households";
import { actionLogRepo, markActionUndone } from "@/lib/db/repositories/action-log";
import { reverseAction } from "@/lib/trust/action-log";

/**
 * Same owner/adult guard shape as feature-flags-actions.ts's
 * requireOwnerOrAdult -- undoing an autonomous write is a
 * household-configuration-grade action (it can delete a record another
 * member is looking at), not an everyday-member action. action_log's own
 * RLS policy ("owner/adult mark action log undone") enforces this same
 * rule server-side; checking here first turns a viewer role's attempt
 * into a clean message instead of a raw Postgres RLS error.
 */
async function requireOwnerOrAdult() {
  const ctx = await requireHouseholdContext();
  const members = await listMembersOfHousehold(ctx.supabase, ctx.household.id);
  const selfMembership = members.find((m) => m.user_id === ctx.userId);
  if (!selfMembership || (selfMembership.role !== "owner" && selfMembership.role !== "adult")) {
    throw new Error("Only household owners and adults can undo an autonomous action.");
  }
  return ctx;
}

/**
 * Undoes one action_log entry: reverses the underlying write (restore
 * before_snapshot for an update, delete the created row for an insert --
 * see reverseAction), then stamps undone_at so the entry can't be undone
 * twice and the UI can grey it out. The two steps are sequential, not a
 * transaction (no cross-table RPC exists for this yet) -- if the reversal
 * throws, markActionUndone is never reached, so a failed undo never lies
 * about having succeeded.
 */
export async function undoActionLogEntryAction(entryId: string): Promise<void> {
  const ctx = await requireOwnerOrAdult();

  const row = await actionLogRepo.getById(ctx.supabase, entryId);
  if (!row || row.household_id !== ctx.household.id) {
    throw new Error("That action could not be found.");
  }
  if (!row.undoable) {
    throw new Error("This action can't be undone.");
  }
  if (row.undone_at) {
    throw new Error("This action was already undone.");
  }

  await reverseAction(ctx.supabase, row);
  await markActionUndone(ctx.supabase, entryId);
  revalidatePath("/settings/activity");
}
