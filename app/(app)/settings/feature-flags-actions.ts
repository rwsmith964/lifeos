"use server";

// Server Action for Settings > Modules (D-138: in-app feature-flag
// management, R-5 in ROADMAP-PROACTIVE-ASSISTANT.md). Every flag introduced
// by the "Build Brief -- Competitive Parity + Moat Extension" engagement has
// been toggled exclusively via direct SQL up to this point (see QUEUE-039)
// -- this gives a household owner/adult a real UI for it instead.

import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { listMembersOfHousehold } from "@/lib/db/repositories/households";
import { FEATURE_FLAGS, setFeatureFlag, type FeatureFlagKey } from "@/lib/flags";

/**
 * Same owner/adult guard shape as household-invite-actions.ts's
 * requireOwnerOrAdult -- flags gate real writes (gift pipeline, intake
 * review queue, etc.), so toggling one is a household-configuration action,
 * not an everyday-member action. feature_flags' own RLS policies enforce
 * this same rule server-side (defense in depth); checking here first turns
 * a viewer role's attempt into a clean message instead of a raw Postgres
 * RLS error.
 */
async function requireOwnerOrAdult() {
  const ctx = await requireHouseholdContext();
  const members = await listMembersOfHousehold(ctx.supabase, ctx.household.id);
  const selfMembership = members.find((m) => m.user_id === ctx.userId);
  if (!selfMembership || (selfMembership.role !== "owner" && selfMembership.role !== "adult")) {
    throw new Error("Only household owners and adults can manage modules.");
  }
  return ctx;
}

/**
 * Throws on failure (rather than returning a SimpleFormState) so it pairs
 * with useAsyncToastAction, same shape as addSuggestedInterestAction (D-137)
 * -- a toggle click needs a pending state + toast + undo, not a form
 * submission state.
 */
export async function setFeatureFlagAction(key: FeatureFlagKey, enabled: boolean): Promise<void> {
  if (!(key in FEATURE_FLAGS)) {
    throw new Error("Unknown module.");
  }
  const ctx = await requireOwnerOrAdult();
  await setFeatureFlag(ctx.supabase, ctx.household.id, key, enabled);
  revalidatePath("/settings");
}
