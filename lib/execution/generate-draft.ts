// Module 6 (execution_draft_only, D-122): the one function that ever
// creates an execution_drafts row. Enforces both halves of the brief's
// exact framing:
//
//   1. "Build a category allowlist, not a blocklist, and default to
//      excluded" — see resolveCategoryEnabled (lib/db/repositories/execution.ts):
//      a household must explicitly enable each category before this
//      function will produce a draft for it, even with the
//      execution_draft_only flag on.
//   2. "Hard exclusion: nothing client-facing" — effectiveIsBusinessContact
//      below always excludes relationship_type='colleague', with no
//      override capable of un-excluding it, and additionally excludes
//      anyone a household member has explicitly flagged as a business
//      contact regardless of relationship_type.
//
// Nothing this function produces is ever sent. It writes exactly one
// execution_drafts row with status='pending_review' — the household
// still has to review and act on it themselves (copy/send it), same as
// approving an intake_drafts row doesn't itself create a calendar event
// without the human's own convert action. There is no "send" function
// anywhere in this module in v1, by design (brief's own "no outbound
// communication in v1" instruction, Section 9) — autonomy_tier values
// beyond 'draft_only' are stored (schema is future-ready) but nothing
// in this codebase acts differently based on them yet; see QUEUE-022.
import type { SupabaseClient } from "@supabase/supabase-js";
import { peopleRepo } from "../db/repositories/people";
import type { ExecutionCategory, ExecutionDraftRow, PersonRow } from "../db/database.types";
import {
  getContactExecutionSettings,
  listExecutionCategoriesForHousehold,
  resolveCategoryEnabled,
  executionDraftsRepo,
} from "../db/repositories/execution";

export class ExecutionDraftRejectedError extends Error {
  constructor(public readonly reason: "category_not_allowed" | "client_facing_excluded") {
    super(
      reason === "category_not_allowed"
        ? "This category isn't enabled for assistant drafts in this household yet."
        : "This contact is marked client/business-facing — the assistant never drafts anything for them."
    );
    this.name = "ExecutionDraftRejectedError";
  }
}

/**
 * relationship_type='colleague' is always excluded, with no override in
 * contact_execution_settings able to un-exclude it — this is the "hard"
 * half of the hard exclusion. A household member can additionally mark
 * ANY other relationship type (e.g. a friend who is also a client) as
 * excluded via contact_execution_settings.is_business_contact — that
 * direction of override is allowed since it only ever narrows what the
 * assistant can touch, never widens it.
 */
export async function effectiveIsBusinessContact(
  client: SupabaseClient,
  householdId: string,
  person: Pick<PersonRow, "id" | "relationship_type">
): Promise<boolean> {
  if (person.relationship_type === "colleague") return true;
  const settings = await getContactExecutionSettings(client, householdId, person.id);
  return settings?.is_business_contact ?? false;
}

export interface ProposeExecutionDraftInput {
  householdId: string;
  category: ExecutionCategory;
  /** Null for a draft addressed to a vendor/entity with no people row (e.g. a gift-order confirmation). */
  contactPersonId: string | null;
  draftSubject?: string | null;
  draftBody: string;
  sourceType?: "manual" | "templated";
  sourceReference?: string | null;
}

/**
 * The single write path for execution_drafts. Throws
 * ExecutionDraftRejectedError (never silently drops a request) when the
 * category isn't enabled or the contact is excluded, so every call site
 * — the manual form and any future automated trigger alike — gets the
 * same enforcement without re-implementing it.
 */
export async function proposeExecutionDraft(
  client: SupabaseClient,
  input: ProposeExecutionDraftInput
): Promise<ExecutionDraftRow> {
  const categories = await listExecutionCategoriesForHousehold(client, input.householdId);
  if (!resolveCategoryEnabled(categories, input.category)) {
    throw new ExecutionDraftRejectedError("category_not_allowed");
  }

  if (input.contactPersonId) {
    const person = await peopleRepo.getById(client, input.contactPersonId);
    if (person && (await effectiveIsBusinessContact(client, input.householdId, person))) {
      throw new ExecutionDraftRejectedError("client_facing_excluded");
    }
  }

  return executionDraftsRepo.create(client, {
    household_id: input.householdId,
    category: input.category,
    contact_person_id: input.contactPersonId,
    source_type: input.sourceType ?? "manual",
    source_reference: input.sourceReference ?? null,
    draft_subject: input.draftSubject ?? null,
    draft_body: input.draftBody,
  });
}

// templateForCategory (the deterministic, non-AI starter text per
// category) lives in ./labels.ts, not here — that file has no
// repository/Supabase-client imports, so the "Use a starter template"
// button in the UI can import it into a client component without
// bundling this module's server-side data-access code. Re-exported here
// too so existing server-side call sites (and this module's own tests)
// have one obvious place to find it.
export { templateForCategory } from "./labels";
