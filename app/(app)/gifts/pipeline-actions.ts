"use server";

// Module 1 (relationship_gift_engine_v2 flag): server actions for the
// finer gift pipeline tracking (idea -> shortlisted -> ... -> given). This
// is a new, separate action file rather than edits to actions.ts -- the
// existing status-transition actions in actions.ts are untouched, and
// every write here goes through the same established giftSuggestionsRepo
// used everywhere else (Additive Contract §3.3: new code never writes
// directly to established tables). See lib/gifts/pipeline.ts for the pure
// stage-transition logic these wrap.
import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { giftSuggestionsRepo } from "@/lib/db/repositories/gifts";
import { isFeatureEnabled } from "@/lib/flags";
import { nextPipelineStage, previousPipelineStage } from "@/lib/gifts/pipeline";
import type { GiftPipelineStage } from "@/lib/db/database.types";

async function requirePipelineEngineEnabled(householdId: string, client: Awaited<ReturnType<typeof requireHouseholdContext>>["supabase"]) {
  const enabled = await isFeatureEnabled(client, householdId, "relationship_gift_engine_v2");
  if (!enabled) {
    throw new Error("The relationship & gift engine isn't turned on for this household yet.");
  }
}

async function loadSuggestionOrThrow(client: Awaited<ReturnType<typeof requireHouseholdContext>>["supabase"], suggestionId: string) {
  const suggestion = await giftSuggestionsRepo.getById(client, suggestionId);
  if (!suggestion) throw new Error("That suggestion no longer exists.");
  return suggestion;
}

function revalidateSuggestionPaths(personId: string) {
  revalidatePath("/gifts");
  revalidatePath("/gifts/saved");
  revalidatePath(`/people/${personId}`);
}

/** Moves a suggestion's pipeline_stage one step forward. Returns the resulting stage. */
export async function advanceSuggestionPipelineStageAction(suggestionId: string): Promise<GiftPipelineStage> {
  const { supabase, household } = await requireHouseholdContext();
  await requirePipelineEngineEnabled(household.id, supabase);
  const suggestion = await loadSuggestionOrThrow(supabase, suggestionId);

  const pipeline_stage = nextPipelineStage(suggestion.pipeline_stage);
  await giftSuggestionsRepo.update(supabase, suggestionId, { pipeline_stage });
  revalidateSuggestionPaths(suggestion.person_id);
  return pipeline_stage;
}

/** Moves a suggestion's pipeline_stage one step back (undo). Returns the resulting stage, or null if cleared. */
export async function revertSuggestionPipelineStageAction(suggestionId: string): Promise<GiftPipelineStage | null> {
  const { supabase, household } = await requireHouseholdContext();
  await requirePipelineEngineEnabled(household.id, supabase);
  const suggestion = await loadSuggestionOrThrow(supabase, suggestionId);

  const pipeline_stage = previousPipelineStage(suggestion.pipeline_stage);
  await giftSuggestionsRepo.update(supabase, suggestionId, { pipeline_stage });
  revalidateSuggestionPaths(suggestion.person_id);
  return pipeline_stage;
}
