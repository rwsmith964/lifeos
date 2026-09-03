// Module 3 (D-119, universal_intake_v2 flag): review-queue actions a
// household member takes on a pending intake draft -- approve (convert to
// a real record), reject (discard), or correct fields before approving.
// Every function re-checks the flag and the household ownership itself
// (defense in depth beyond RLS, same posture as isKnownPersonId in
// lib/ai/capture-actions.ts) rather than trusting the route layer alone.
import type { SupabaseClient } from "@supabase/supabase-js";
import { isFeatureEnabled } from "../flags";
import { intakeDraftsRepo } from "../db/repositories/intake";
import type { HouseholdRow, IntakeDraftRow, PersonRow } from "../db/database.types";
import { convertDraftToRecord, type ConversionOutcome } from "./convert";
import { computeOverallConfidence, type ExtractedField } from "./confidence";

export class IntakeFeatureDisabledError extends Error {
  constructor() {
    super("universal_intake_v2 is not enabled for this household");
  }
}

async function loadOwnedDraft(supabase: SupabaseClient, household: HouseholdRow, draftId: string): Promise<IntakeDraftRow> {
  const draft = await intakeDraftsRepo.getById(supabase, draftId);
  if (!draft || draft.household_id !== household.id) {
    throw new Error("Draft not found");
  }
  return draft;
}

async function requireIntakeEnabled(supabase: SupabaseClient, householdId: string): Promise<void> {
  const enabled = await isFeatureEnabled(supabase, householdId, "universal_intake_v2");
  if (!enabled) throw new IntakeFeatureDisabledError();
}

/**
 * Converts an approved draft into a real record and marks it converted.
 * `resolvedPersonId` is the reviewer's choice of which household member
 * this draft's mentioned name refers to -- required for record types that
 * need a person link (gift_idea, person_note); see convertDraftToRecord.
 */
export async function approveDraft(
  supabase: SupabaseClient,
  household: HouseholdRow,
  selfPerson: PersonRow,
  draftId: string,
  resolvedPersonId?: string | null,
  userId?: string | null
): Promise<ConversionOutcome> {
  await requireIntakeEnabled(supabase, household.id);
  const draft = await loadOwnedDraft(supabase, household, draftId);
  if (draft.status === "converted") throw new Error("Draft has already been converted");
  if (draft.status === "rejected") throw new Error("A rejected draft can't be approved -- create a new one instead");

  const outcome = await convertDraftToRecord({ supabase, household, selfPerson, resolvedPersonId, userId }, draft);

  await intakeDraftsRepo.update(supabase, draft.id, {
    status: "converted",
    converted_table: outcome.table,
    converted_record_id: outcome.recordId,
  });

  return outcome;
}

/** Discards a draft without creating anything -- e.g. it was noise, a
 * duplicate, or something the household member decided not to act on. */
export async function rejectDraft(
  supabase: SupabaseClient,
  household: HouseholdRow,
  draftId: string,
  reviewNote?: string | null
): Promise<IntakeDraftRow> {
  await requireIntakeEnabled(supabase, household.id);
  const draft = await loadOwnedDraft(supabase, household, draftId);
  if (draft.status === "converted") throw new Error("A converted draft can't be rejected");

  return intakeDraftsRepo.update(supabase, draft.id, {
    status: "rejected",
    review_note: reviewNote ?? null,
  });
}

/**
 * A reviewer corrects one or more extracted field values (e.g. the AI
 * misread a date) and/or the detected record type before approving.
 * Corrected fields are recorded at confidence 1.0 -- a human just
 * confirmed them, so they're no longer an estimate. Recomputes
 * overall_confidence from the merged field set.
 */
export async function correctDraftFields(
  supabase: SupabaseClient,
  household: HouseholdRow,
  draftId: string,
  corrections: Record<string, unknown>,
  detectedRecordType?: IntakeDraftRow["detected_record_type"]
): Promise<IntakeDraftRow> {
  await requireIntakeEnabled(supabase, household.id);
  const draft = await loadOwnedDraft(supabase, household, draftId);
  if (draft.status === "converted" || draft.status === "rejected") {
    throw new Error("Only a pending or needs_review draft can be corrected");
  }

  const existingFields = (draft.extracted_fields ?? {}) as Record<string, ExtractedField>;
  const mergedFields: Record<string, ExtractedField> = { ...existingFields };
  for (const [key, value] of Object.entries(corrections)) {
    mergedFields[key] = { value, confidence: 1 };
  }

  return intakeDraftsRepo.update(supabase, draft.id, {
    extracted_fields: mergedFields,
    overall_confidence: computeOverallConfidence(mergedFields),
    detected_record_type: detectedRecordType ?? draft.detected_record_type,
  });
}
