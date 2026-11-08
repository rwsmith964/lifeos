// "Snap a photo from anywhere": the shared approve/discard steps for a draft
// created from a photo taken with the always-visible camera button. These
// mirror approveDraft/rejectDraft in review-queue.ts but are NOT gated on the
// universal_intake_v2 flag: the camera button is a core feature for every
// household, not an opt-in module. Conversion itself still goes through
// convertDraftToRecord, so every write is the same verified, action-logged
// one the Add anything page produces.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HouseholdRow, IntakeDraftRow, PersonRow } from "../db/database.types";
import { intakeDraftsRepo } from "../db/repositories/intake";
import { convertDraftToRecord, NON_CONVERTIBLE_TYPES, type ConversionOutcome } from "./convert";

async function loadOwnedDraft(supabase: SupabaseClient, household: HouseholdRow, draftId: string): Promise<IntakeDraftRow> {
  const draft = await intakeDraftsRepo.getById(supabase, draftId);
  if (!draft || draft.household_id !== household.id) throw new Error("Draft not found");
  return draft;
}

export function isConvertibleRecordType(type: IntakeDraftRow["detected_record_type"]): boolean {
  return !!type && !(NON_CONVERTIBLE_TYPES as readonly string[]).includes(type);
}

export async function approveSnapDraft(
  supabase: SupabaseClient,
  household: HouseholdRow,
  selfPerson: PersonRow,
  draftId: string,
  resolvedPersonId: string | null,
  userId: string | null,
  timezone: string | null
): Promise<ConversionOutcome> {
  const draft = await loadOwnedDraft(supabase, household, draftId);
  if (draft.status === "converted") throw new Error("That was already added.");
  if (draft.status === "rejected") throw new Error("That was already discarded.");

  const outcome = await convertDraftToRecord({ supabase, household, selfPerson, resolvedPersonId, userId, timezone }, draft);
  await intakeDraftsRepo.update(supabase, draft.id, {
    status: "converted",
    converted_table: outcome.table,
    converted_record_id: outcome.recordId,
  });
  return outcome;
}

export async function discardSnapDraft(supabase: SupabaseClient, household: HouseholdRow, draftId: string): Promise<void> {
  const draft = await loadOwnedDraft(supabase, household, draftId);
  if (draft.status === "converted") throw new Error("That was already added.");
  await intakeDraftsRepo.update(supabase, draft.id, { status: "rejected", review_note: "Discarded from the camera button" });
}
