"use server";

// Module 6 (execution_draft_only, D-122) server actions. Every write here
// goes through the request-scoped, RLS-enforced client from
// requireHouseholdContext() — same as every other module — and through
// the existing repository/business-logic functions in lib/db/repositories/execution.ts
// and lib/execution/generate-draft.ts (Additive Contract §3: new code
// never writes directly to established tables; these tables are
// themselves new, and this is their only write path).
import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/flags";
import {
  setExecutionCategoryEnabled,
  setContactBusinessFlag,
  reviewExecutionDraft,
} from "@/lib/db/repositories/execution";
import { proposeExecutionDraft, templateForCategory } from "@/lib/execution/generate-draft";
import { getOrCreateAssistantEmailConfig } from "@/lib/execution/assistant-address";
import type { ExecutionCategory } from "@/lib/db/database.types";

async function requireExecutionEnabled() {
  const ctx = await requireHouseholdContext();
  const enabled = await isFeatureEnabled(ctx.supabase, ctx.household.id, "execution_draft_only");
  if (!enabled) {
    throw new Error("The execution scaffold isn't turned on for this household yet.");
  }
  return ctx;
}

function revalidateExecutionPaths() {
  revalidatePath("/execution");
}

export async function toggleExecutionCategoryAction(category: ExecutionCategory, enabled: boolean) {
  const { supabase, household } = await requireExecutionEnabled();
  await setExecutionCategoryEnabled(supabase, household.id, category, enabled);
  revalidateExecutionPaths();
}

export async function setContactBusinessFlagAction(personId: string, isBusinessContact: boolean) {
  const { supabase, household } = await requireExecutionEnabled();
  await setContactBusinessFlag(supabase, household.id, personId, isBusinessContact);
  revalidateExecutionPaths();
}

export async function ensureAssistantEmailConfigAction() {
  const { supabase, household } = await requireExecutionEnabled();
  const config = await getOrCreateAssistantEmailConfig(supabase, household.id, household.name);
  revalidateExecutionPaths();
  return config;
}

export interface CreateDraftInput {
  category: ExecutionCategory;
  contactPersonId: string | null;
  contactName: string | null;
  draftSubject: string;
  draftBody: string;
  useTemplate: boolean;
}

export async function createExecutionDraftAction(input: CreateDraftInput) {
  const { supabase, household } = await requireExecutionEnabled();

  const body = input.useTemplate ? templateForCategory(input.category, input.contactName) : input.draftBody;
  if (!body.trim()) {
    throw new Error("A draft needs some body text before it can be saved for review.");
  }

  await proposeExecutionDraft(supabase, {
    householdId: household.id,
    category: input.category,
    contactPersonId: input.contactPersonId,
    draftSubject: input.draftSubject.trim() || null,
    draftBody: body,
    sourceType: input.useTemplate ? "templated" : "manual",
  });
  revalidateExecutionPaths();
}

export async function reviewExecutionDraftAction(draftId: string, status: "approved" | "discarded") {
  const { supabase, selfPerson } = await requireExecutionEnabled();
  await reviewExecutionDraft(supabase, draftId, status, selfPerson.id);
  revalidateExecutionPaths();
}
