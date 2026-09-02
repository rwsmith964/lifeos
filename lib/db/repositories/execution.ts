// Module 6 (execution_draft_only, D-122) repositories. Every table here is
// additive (supabase/migrations/20260901000006_module6_execution_draft_only.sql)
// and every write in this file goes through RLS on the caller's own
// request-scoped client — no service-role bypass, same as every other
// repository in this directory.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type {
  AssistantEmailConfigInsert,
  AssistantEmailConfigRow,
  ContactExecutionSettingsInsert,
  ContactExecutionSettingsRow,
  ContactExecutionSettingsUpdate,
  ExecutionCategory,
  ExecutionCategoryInsert,
  ExecutionCategoryRow,
  ExecutionCategoryUpdate,
  ExecutionDraftInsert,
  ExecutionDraftRow,
  ExecutionDraftStatus,
  ExecutionDraftUpdate,
} from "../database.types";

export const executionCategoriesRepo = createRepository<
  ExecutionCategoryRow,
  ExecutionCategoryInsert,
  ExecutionCategoryUpdate
>("execution_categories");

export const contactExecutionSettingsRepo = createRepository<
  ContactExecutionSettingsRow,
  ContactExecutionSettingsInsert,
  ContactExecutionSettingsUpdate
>("contact_execution_settings");

export const executionDraftsRepo = createRepository<ExecutionDraftRow, ExecutionDraftInsert, ExecutionDraftUpdate>(
  "execution_drafts"
);

/** Every category row for a household, one per ExecutionCategory at most (unique constraint). Categories with no row are NOT enabled — see resolveCategoryEnabled. */
export async function listExecutionCategoriesForHousehold(
  client: SupabaseClient,
  householdId: string
): Promise<ExecutionCategoryRow[]> {
  return executionCategoriesRepo.list(client, (q) => q.eq("household_id", householdId));
}

/** True only if a row exists AND enabled=true. Absence (the default for every category on every household) means excluded — the allowlist-not-blocklist default the brief requires. */
export function resolveCategoryEnabled(rows: ExecutionCategoryRow[], category: ExecutionCategory): boolean {
  return rows.find((r) => r.category === category)?.enabled ?? false;
}

/** Owner/adult-gated by RLS on execution_categories itself. */
export async function setExecutionCategoryEnabled(
  client: SupabaseClient,
  householdId: string,
  category: ExecutionCategory,
  enabled: boolean
): Promise<ExecutionCategoryRow> {
  return executionCategoriesRepo.upsert(client, { household_id: householdId, category, enabled }, "household_id,category");
}

export async function getContactExecutionSettings(
  client: SupabaseClient,
  householdId: string,
  personId: string
): Promise<ContactExecutionSettingsRow | null> {
  const rows = await contactExecutionSettingsRepo.list(client, (q) =>
    q.eq("household_id", householdId).eq("person_id", personId)
  );
  return rows[0] ?? null;
}

export async function listContactExecutionSettingsForHousehold(
  client: SupabaseClient,
  householdId: string
): Promise<ContactExecutionSettingsRow[]> {
  return contactExecutionSettingsRepo.list(client, (q) => q.eq("household_id", householdId));
}

/** Owner/adult-gated by RLS on contact_execution_settings itself. */
export async function setContactBusinessFlag(
  client: SupabaseClient,
  householdId: string,
  personId: string,
  isBusinessContact: boolean
): Promise<ContactExecutionSettingsRow> {
  return contactExecutionSettingsRepo.upsert(
    client,
    { household_id: householdId, person_id: personId, is_business_contact: isBusinessContact },
    "household_id,person_id"
  );
}

export async function listPendingExecutionDrafts(
  client: SupabaseClient,
  householdId: string
): Promise<ExecutionDraftRow[]> {
  const { data, error } = await client
    .from("execution_drafts")
    .select("*")
    .eq("household_id", householdId)
    .eq("status", "pending_review")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ExecutionDraftRow[];
}

export async function listReviewedExecutionDrafts(
  client: SupabaseClient,
  householdId: string,
  limit = 20
): Promise<ExecutionDraftRow[]> {
  const { data, error } = await client
    .from("execution_drafts")
    .select("*")
    .eq("household_id", householdId)
    .in("status", ["approved", "discarded"])
    .order("reviewed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ExecutionDraftRow[];
}

/** The one place any execution_drafts.status transition happens — sets the reviewed pair together so the DB's execution_drafts_reviewed_pair constraint is always satisfied. */
export async function reviewExecutionDraft(
  client: SupabaseClient,
  draftId: string,
  status: Extract<ExecutionDraftStatus, "approved" | "discarded">,
  reviewedByPersonId: string
): Promise<ExecutionDraftRow> {
  return executionDraftsRepo.update(client, draftId, {
    status,
    reviewed_by_person_id: reviewedByPersonId,
    reviewed_at: new Date().toISOString(),
  });
}

// assistant_email_config — no `id` column (household_id is the primary
// key), so this doesn't go through createRepository (which requires
// Row extends {id: string}).

export async function getAssistantEmailConfig(
  client: SupabaseClient,
  householdId: string
): Promise<AssistantEmailConfigRow | null> {
  const { data, error } = await client
    .from("assistant_email_config")
    .select("*")
    .eq("household_id", householdId)
    .maybeSingle();
  if (error) throw error;
  return data as AssistantEmailConfigRow | null;
}

export async function upsertAssistantEmailConfig(
  client: SupabaseClient,
  values: AssistantEmailConfigInsert
): Promise<AssistantEmailConfigRow> {
  const { data, error } = await client
    .from("assistant_email_config")
    .upsert(values as never, { onConflict: "household_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data as AssistantEmailConfigRow;
}
