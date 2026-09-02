// Module 6 (execution_draft_only, D-122): the household's assistant email
// address — generated once, stored, and displayed, but NOT wired to any
// live inbound channel in v1. The project already has an on-record
// blocker (the Resend verified-sending-domain decision) that no outbound
// mail reaches anyone but the account owner yet; receiving mail for a
// CC/forward address needs the same domain-level DNS work. Logged as
// QUEUE-021.
//
// This module only produces and persists the alias so the UI has
// something real to show today, and so a future inbound-parsing webhook
// can route on a stable value without a schema change.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAssistantEmailConfig, upsertAssistantEmailConfig } from "../db/repositories/execution";
import type { AssistantEmailConfigRow } from "../db/database.types";

/** Placeholder domain — never a live inbox until the verified-domain work lands (QUEUE-021). Kept in one place so wiring a real domain later is a one-line change. */
export const ASSISTANT_EMAIL_DOMAIN = "assist.lifeos.app";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Short, non-guessable suffix so two households named similarly (or the same household recreated) never collide on assistant_email_config.alias's unique constraint. */
function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * Idempotent: returns the existing alias if one was already generated for
 * this household, otherwise generates and persists one. Never changes an
 * existing alias — see the migration's column comment for why that
 * matters once inbound wiring exists.
 */
export async function getOrCreateAssistantEmailConfig(
  client: SupabaseClient,
  householdId: string,
  householdName: string
): Promise<AssistantEmailConfigRow> {
  const existing = await getAssistantEmailConfig(client, householdId);
  if (existing) return existing;

  const alias = `${slugify(householdName) || "household"}-${randomSuffix()}`;
  return upsertAssistantEmailConfig(client, { household_id: householdId, alias });
}

export function assistantEmailAddress(config: AssistantEmailConfigRow): string {
  return `${config.alias}@${ASSISTANT_EMAIL_DOMAIN}`;
}
