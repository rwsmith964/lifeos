"use server";

// Module 2: Leisure Planner (D-118, leisure_planner_v2 flag). A separate
// action file from actions.ts, not edits to it -- every action here is
// entirely new surface area gated behind the flag, so nothing in
// actions.ts needs to change. All writes go through the established
// repository factory (lib/db/repositories/leisure-planner.ts), never
// straight to a table from here.
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireHouseholdContext } from "@/lib/auth/session";
import {
  activityTypeViabilityConfigsRepo,
  gearChecklistItemsRepo,
  leisureOutingLogsRepo,
} from "@/lib/db/repositories/leisure-planner";
import { userActivitiesRepo } from "@/lib/db/repositories/activities";
import { momentsRepo } from "@/lib/db/repositories/relationship-gift-engine";
import {
  activityTypeViabilityConfigInsertSchema,
  gearChecklistItemInsertSchema,
  leisureOutingLogInsertSchema,
} from "@/lib/db/schemas";
import { friendlyMutationError } from "@/lib/db/errors";
import { isFeatureEnabled } from "@/lib/flags";

export interface SimpleFormState {
  error: string | null;
}

const FLAG_OFF_MESSAGE = "The leisure planner isn't turned on for this household yet.";

async function requirePlannerEnabled(supabase: SupabaseClient, householdId: string): Promise<string | null> {
  const enabled = await isFeatureEnabled(supabase, householdId, "leisure_planner_v2");
  return enabled ? null : FLAG_OFF_MESSAGE;
}

/** Confirms `userActivityId` actually belongs to the caller's active household before any write -- tenant scoping (Additive Contract §3.7). */
async function assertActivityInHousehold(
  supabase: SupabaseClient,
  userActivityId: string,
  householdId: string
): Promise<string | null> {
  const activity = await userActivitiesRepo.getById(supabase, userActivityId);
  if (!activity || activity.household_id !== householdId) return "Activity not found.";
  return null;
}

// activity_type_viability_configs ---------------------------------------------

export async function saveViabilityConfigAction(
  _prevState: SimpleFormState,
  formData: FormData
): Promise<SimpleFormState> {
  const { supabase, household } = await requireHouseholdContext();
  const flagError = await requirePlannerEnabled(supabase, household.id);
  if (flagError) return { error: flagError };

  const relevantInputsRaw = formData.get("relevantInputs");
  const relevantInputs =
    typeof relevantInputsRaw === "string" && relevantInputsRaw.trim() !== ""
      ? relevantInputsRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

  const parsed = activityTypeViabilityConfigInsertSchema.safeParse({
    household_id: household.id,
    activity_type_key: String(formData.get("activityType") ?? ""),
    relevant_inputs: relevantInputs,
    notes: (formData.get("notes") as string | null)?.trim() || null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Couldn't save that configuration." };
  }

  try {
    // One config row per (household, activity_type_key) -- see the unique
    // index in the Module 2 migration -- so re-saving the same type updates
    // it rather than creating a duplicate.
    await activityTypeViabilityConfigsRepo.upsert(supabase, parsed.data, "household_id,activity_type_key");
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't save that configuration — please try again." }) };
  }
  revalidatePath("/activities");
  return { error: null };
}

export async function deleteViabilityConfigAction(configId: string): Promise<SimpleFormState> {
  const { supabase, household } = await requireHouseholdContext();
  const flagError = await requirePlannerEnabled(supabase, household.id);
  if (flagError) return { error: flagError };

  const config = await activityTypeViabilityConfigsRepo.getById(supabase, configId);
  if (!config || config.household_id !== household.id) {
    return { error: "Configuration not found." };
  }
  try {
    await activityTypeViabilityConfigsRepo.remove(supabase, configId);
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't remove that configuration — please try again." }) };
  }
  revalidatePath("/activities");
  return { error: null };
}

// gear_checklist_items ---------------------------------------------------------

export async function addGearChecklistItemAction(
  _prevState: SimpleFormState,
  formData: FormData
): Promise<SimpleFormState> {
  const { supabase, household } = await requireHouseholdContext();
  const flagError = await requirePlannerEnabled(supabase, household.id);
  if (flagError) return { error: flagError };

  const userActivityId = (formData.get("userActivityId") as string | null) || null;
  if (userActivityId) {
    const scopeError = await assertActivityInHousehold(supabase, userActivityId, household.id);
    if (scopeError) return { error: scopeError };
  }

  const activityTypeRaw = (formData.get("activityTypeKey") as string | null)?.trim() || null;
  const sortOrderRaw = formData.get("sortOrder");

  const parsed = gearChecklistItemInsertSchema.safeParse({
    household_id: household.id,
    user_activity_id: userActivityId,
    activity_type_key: activityTypeRaw,
    item_label: String(formData.get("itemLabel") ?? ""),
    sort_order: sortOrderRaw != null && sortOrderRaw !== "" ? Number(sortOrderRaw) : undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Couldn't add that gear item." };
  }

  try {
    await gearChecklistItemsRepo.create(supabase, parsed.data);
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't add that gear item — please try again." }) };
  }
  if (userActivityId) revalidatePath(`/activities/${userActivityId}/edit`);
  revalidatePath("/activities");
  return { error: null };
}

export async function removeGearChecklistItemAction(itemId: string): Promise<SimpleFormState> {
  const { supabase, household } = await requireHouseholdContext();
  const flagError = await requirePlannerEnabled(supabase, household.id);
  if (flagError) return { error: flagError };

  const item = await gearChecklistItemsRepo.getById(supabase, itemId);
  if (!item || item.household_id !== household.id) {
    return { error: "Gear item not found." };
  }
  try {
    await gearChecklistItemsRepo.remove(supabase, itemId);
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't remove that gear item — please try again." }) };
  }
  if (item.user_activity_id) revalidatePath(`/activities/${item.user_activity_id}/edit`);
  revalidatePath("/activities");
  return { error: null };
}

// leisure_outing_logs -----------------------------------------------------------

/**
 * Records a post-outing capture: the outing log row itself, then two
 * optional write-throughs to *existing* repositories (never a direct write
 * to their tables from here, per the Additive Contract):
 *  - `user_activities.last_done_at` via userActivitiesRepo.update, so the
 *    existing recency-penalty scoring signal (lib/planner/scoring.ts) picks
 *    up richer outings the same way it already picks up the quick
 *    "mark done today" button.
 *  - a Module 1 `moments` row via momentsRepo.create, so a rated/noted
 *    outing with companions shows up alongside other family moments,
 *    gated on the *outing log's own* flag only -- momentsRepo itself has no
 *    flag check, so this call site is what keeps it additive.
 */
export async function logOutingAction(
  _prevState: SimpleFormState,
  formData: FormData
): Promise<SimpleFormState> {
  const { supabase, household } = await requireHouseholdContext();
  const flagError = await requirePlannerEnabled(supabase, household.id);
  if (flagError) return { error: flagError };

  const userActivityId = String(formData.get("userActivityId") ?? "");
  const scopeError = await assertActivityInHousehold(supabase, userActivityId, household.id);
  if (scopeError) return { error: scopeError };

  const companionsRaw = formData.get("companionsPersonIds");
  const companions =
    typeof companionsRaw === "string" && companionsRaw.trim() !== ""
      ? companionsRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;
  const gearItemsRaw = formData.get("gearItemsPacked");
  const gearItems =
    typeof gearItemsRaw === "string" && gearItemsRaw.trim() !== ""
      ? gearItemsRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;
  const ratingRaw = formData.get("rating");

  const parsed = leisureOutingLogInsertSchema.safeParse({
    household_id: household.id,
    user_activity_id: userActivityId,
    occurred_on: String(formData.get("occurredOn") ?? ""),
    conditions_notes: (formData.get("conditionsNotes") as string | null)?.trim() || null,
    companions_person_ids: companions,
    rating: ratingRaw != null && ratingRaw !== "" ? Number(ratingRaw) : null,
    notes: (formData.get("notes") as string | null)?.trim() || null,
    gear_items_packed: gearItems,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Couldn't save that outing." };
  }

  try {
    await leisureOutingLogsRepo.create(supabase, parsed.data);
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't save that outing — please try again." }) };
  }

  // Write-through #1: existing recency signal. Best-effort -- the outing
  // log itself already succeeded and is the source of truth for this
  // capture, so a failure here is logged-away rather than surfaced as an
  // overall failure to the user.
  try {
    await userActivitiesRepo.update(supabase, userActivityId, { last_done_at: parsed.data.occurred_on });
  } catch {
    // Non-fatal: the outing log recorded successfully regardless.
  }

  // Write-through #2: optional Module 1 moment, only when requested.
  const logAsMoment = formData.get("logAsMoment") === "on" || formData.get("logAsMoment") === "true";
  if (logAsMoment) {
    try {
      await momentsRepo.create(supabase, {
        household_id: household.id,
        title: (formData.get("momentTitle") as string | null)?.trim() || "Outing",
        occurred_on: parsed.data.occurred_on,
        notes: parsed.data.notes ?? null,
        participant_person_ids: parsed.data.companions_person_ids ?? [],
        created_by_person_id: parsed.data.created_by_person_id ?? null,
      });
    } catch {
      // Non-fatal: the outing log recorded successfully regardless.
    }
  }

  revalidatePath(`/activities/${userActivityId}`);
  revalidatePath("/activities");
  return { error: null };
}

export async function deleteOutingLogAction(outingLogId: string): Promise<SimpleFormState> {
  const { supabase, household } = await requireHouseholdContext();
  const flagError = await requirePlannerEnabled(supabase, household.id);
  if (flagError) return { error: flagError };

  const log = await leisureOutingLogsRepo.getById(supabase, outingLogId);
  if (!log || log.household_id !== household.id) {
    return { error: "Outing not found." };
  }
  try {
    await leisureOutingLogsRepo.remove(supabase, outingLogId);
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't remove that outing — please try again." }) };
  }
  revalidatePath(`/activities/${log.user_activity_id}`);
  revalidatePath("/activities");
  return { error: null };
}
