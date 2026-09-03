"use server";

// Module 3 (universal_intake_v2, D-136) review-queue server actions.
// Submission itself goes through the existing POST /api/intake route
// (already flag-gated, already tested) via a client-side fetch in
// intake-capture-form.tsx -- these actions only cover what that route
// doesn't: approving or rejecting an existing intake_drafts row. Every
// write goes through lib/intake/review-queue.ts, which itself never
// writes anywhere outside intake_drafts except through convertDraftToRecord's
// existing repository calls (Additive Contract §3).
import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { approveDraft, rejectDraft } from "@/lib/intake/review-queue";

function revalidateIntakePaths() {
  revalidatePath("/intake");
}

export async function approveIntakeDraftAction(draftId: string, resolvedPersonId?: string | null) {
  const { supabase, household, selfPerson, userId } = await requireHouseholdContext();
  await approveDraft(supabase, household, selfPerson, draftId, resolvedPersonId ?? null, userId);
  revalidateIntakePaths();
}

export async function rejectIntakeDraftAction(draftId: string) {
  const { supabase, household } = await requireHouseholdContext();
  await rejectDraft(supabase, household, draftId);
  revalidateIntakePaths();
}
