"use server";

// B1/B2 (audit pass 2026-09-11): inline actions for the Today priority
// cards, so acting on a card doesn't require leaving the page. Every
// action here revalidates "/" (not just whatever page the underlying data
// also happens to live on) since Today recomputes its priority stack fresh
// on every load from that same underlying data.
import { addDays, format } from "date-fns";
import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { getZonedNow } from "@/lib/timezones";
import { interactionsRepo, recordContactForCadence } from "@/lib/db/repositories/contact";
import { interactionInsertSchema } from "@/lib/db/schemas";
import { setItemDismissal } from "@/lib/db/repositories/today-dismissals";
import { isFeatureEnabled } from "@/lib/flags";
import { upsertMealPlanSlot } from "@/lib/db/repositories/household";
import { friendlyMutationError } from "@/lib/db/errors";

export interface TodayActionState {
  error: string | null;
}

/**
 * B2: "Dismiss" hides an item for the rest of today; "snooze" hides it for
 * a stated number of days. Both are just different `hiddenUntil` horizons
 * over the same table -- see supabase/migrations/20260911000001_today_item_dismissals.sql.
 * Gracefully degrades (rather than 500ing the whole page) if that
 * migration hasn't been applied to this environment yet -- see QUESTIONS.md.
 */
export async function dismissTodayItemAction(itemKey: string, mode: "dismiss" | "snooze"): Promise<TodayActionState> {
  const { supabase, household, selfPerson, timezone } = await requireHouseholdContext();
  const today = getZonedNow(timezone);
  const hiddenUntil = format(addDays(today, mode === "snooze" ? 3 : 1), "yyyy-MM-dd");

  try {
    await setItemDismissal(supabase, {
      householdId: household.id,
      personId: selfPerson.id,
      itemKey,
      hiddenUntil,
    });
  } catch (error) {
    return {
      error: friendlyMutationError(error, {
        fallback: "Couldn't save that yet — the dismiss/snooze feature needs a database migration applied first.",
      }),
    };
  }

  revalidatePath("/");
  return { error: null };
}

/** B1: "Log contact" directly from a reach-out card, without leaving Today. Same write path as the person page's own Log contact button. */
export async function logContactFromTodayAction(personId: string): Promise<TodayActionState> {
  const { supabase, timezone } = await requireHouseholdContext();

  try {
    const occurredOn = getZonedNow(timezone).toISOString().slice(0, 10);
    const parsed = interactionInsertSchema.parse({
      person_id: personId,
      interaction_type: "in_person",
      occurred_on: occurredOn,
    });
    await interactionsRepo.create(supabase, parsed);
    await recordContactForCadence(supabase, personId, occurredOn, "in_person");
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't log that contact — please try again." }) };
  }

  revalidatePath("/");
  revalidatePath(`/people/${personId}`);
  return { error: null };
}

/** B1: the dinner card's inline meal picker -- a minimal "just tell me what's for dinner" input, not the full Household meal-plan form. */
export async function planDinnerFromTodayAction(customMealName: string): Promise<TodayActionState> {
  const { supabase, household, selfPerson, timezone } = await requireHouseholdContext();

  const enabled = await isFeatureEnabled(supabase, household.id, "household_layer");
  if (!enabled) return { error: "The household layer isn't turned on for this household yet." };

  const trimmed = customMealName.trim();
  if (!trimmed) return { error: "Type what's for dinner first." };

  try {
    await upsertMealPlanSlot(supabase, {
      household_id: household.id,
      planned_date: format(getZonedNow(timezone), "yyyy-MM-dd"),
      meal_slot: "dinner",
      recipe_id: null,
      custom_meal_name: trimmed,
      created_by_person_id: selfPerson.id,
    });
  } catch (error) {
    return { error: friendlyMutationError(error, { fallback: "Couldn't plan that meal — please try again." }) };
  }

  revalidatePath("/");
  revalidatePath("/household");
  return { error: null };
}
