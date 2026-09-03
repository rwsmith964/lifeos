// Module 3 (D-119, universal_intake_v2 flag) -- repository layer for
// intake_drafts (supabase/migrations/20260901000004_module3_intake_trust_layer.sql).
// Every function here is additive: nothing existing calls this file, so it
// has zero effect on current behavior until a flagged caller uses it.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type { IntakeDraftInsert, IntakeDraftRow, IntakeDraftUpdate } from "../database.types";

export const intakeDraftsRepo = createRepository<IntakeDraftRow, IntakeDraftInsert, IntakeDraftUpdate>("intake_drafts");

/** Drafts sitting in the review queue for a household: status='needs_review',
 * oldest first (first submitted, first reviewed) -- the queue lib/intake's
 * review-queue.ts reads to render to a household member. */
export async function listReviewQueueForHousehold(client: SupabaseClient, householdId: string): Promise<IntakeDraftRow[]> {
  return intakeDraftsRepo.list(client, (q) =>
    q.eq("household_id", householdId).eq("status", "needs_review").order("created_at", { ascending: true })
  );
}

/** Every draft for a household regardless of status, most recent first --
 * used by the weekly digest and any future "everything intake has seen"
 * view. */
export async function listAllDraftsForHousehold(client: SupabaseClient, householdId: string): Promise<IntakeDraftRow[]> {
  return intakeDraftsRepo.list(client, (q) => q.eq("household_id", householdId).order("created_at", { ascending: false }));
}

/** Actionable drafts (not yet converted or rejected) for a household's
 * intake page, oldest-submitted first -- includes both "needs_review"
 * (below the confidence threshold) and "ready" (high-confidence, still
 * shown for a one-tap approve rather than silently auto-converting) so
 * every unresolved draft has exactly one place a household member sees
 * it. */
export async function listActionableDraftsForHousehold(client: SupabaseClient, householdId: string): Promise<IntakeDraftRow[]> {
  return intakeDraftsRepo.list(client, (q) =>
    q.eq("household_id", householdId).in("status", ["pending", "needs_review", "ready"]).order("created_at", { ascending: true })
  );
}

/** Most recently resolved (converted or rejected) drafts, newest first,
 * capped so the intake page's history section stays short -- this is a
 * quick "what happened recently" glance, not a full audit log (the
 * action_log table already covers that). */
export async function listRecentResolvedDraftsForHousehold(
  client: SupabaseClient,
  householdId: string,
  limit = 15
): Promise<IntakeDraftRow[]> {
  return intakeDraftsRepo.list(client, (q) =>
    q.eq("household_id", householdId).in("status", ["converted", "rejected"]).order("updated_at", { ascending: false }).limit(limit)
  );
}
