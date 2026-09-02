"use server";

// Module 7 (household_layer, D-123) server actions. Every write goes
// through the request-scoped, RLS-enforced client from
// requireHouseholdContext() and through lib/db/repositories/household.ts —
// never a raw insert against these tables (Additive Contract §3).
import { revalidatePath } from "next/cache";
import { requireHouseholdContext } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/flags";
import {
  addDietaryPreference,
  choresRepo,
  completeChore,
  generateGroceryListFromMealPlan,
  groceryListItemsRepo,
  groceryListsRepo,
  mealPlansRepo,
  pantryItemsRepo,
  recipesRepo,
  removeDietaryPreference,
  reopenChore,
  upsertMealPlanSlot,
} from "@/lib/db/repositories/household";
import type { DietaryRestriction, GroceryAisle, MealSlot } from "@/lib/db/database.types";

async function requireHouseholdLayerEnabled() {
  const ctx = await requireHouseholdContext();
  const enabled = await isFeatureEnabled(ctx.supabase, ctx.household.id, "household_layer");
  if (!enabled) {
    throw new Error("The household layer isn't turned on for this household yet.");
  }
  return ctx;
}

function revalidateHouseholdPaths() {
  revalidatePath("/household");
}

// dietary preferences --------------------------------------------------

export async function addDietaryPreferenceAction(personId: string, restriction: DietaryRestriction, notes: string) {
  const { supabase, household } = await requireHouseholdLayerEnabled();
  await addDietaryPreference(supabase, household.id, personId, restriction, notes.trim() || null);
  revalidateHouseholdPaths();
}

export async function removeDietaryPreferenceAction(id: string) {
  const { supabase } = await requireHouseholdLayerEnabled();
  await removeDietaryPreference(supabase, id);
  revalidateHouseholdPaths();
}

// pantry -----------------------------------------------------------------

export async function addPantryItemAction(name: string, quantity: string, aisle: GroceryAisle, expiresOn: string) {
  const { supabase, household } = await requireHouseholdLayerEnabled();
  await pantryItemsRepo.create(supabase, {
    household_id: household.id,
    name: name.trim(),
    quantity: quantity.trim() || null,
    aisle,
    expires_on: expiresOn || null,
  });
  revalidateHouseholdPaths();
}

export async function removePantryItemAction(id: string) {
  const { supabase } = await requireHouseholdLayerEnabled();
  await pantryItemsRepo.remove(supabase, id);
  revalidateHouseholdPaths();
}

// recipes ------------------------------------------------------------------

export async function addRecipeAction(input: {
  title: string;
  ingredients: string;
  instructions: string;
  servings: string;
  sourceUrl: string;
}) {
  const { supabase, household, selfPerson } = await requireHouseholdLayerEnabled();
  const servings = input.servings.trim() ? Number.parseInt(input.servings, 10) : null;
  await recipesRepo.create(supabase, {
    household_id: household.id,
    created_by_person_id: selfPerson.id,
    title: input.title.trim(),
    ingredients: input.ingredients.trim(),
    instructions: input.instructions.trim() || null,
    servings: servings && Number.isFinite(servings) ? servings : null,
    source_url: input.sourceUrl.trim() || null,
  });
  revalidateHouseholdPaths();
}

export async function removeRecipeAction(id: string) {
  const { supabase } = await requireHouseholdLayerEnabled();
  await recipesRepo.remove(supabase, id);
  revalidateHouseholdPaths();
}

// meal plans -----------------------------------------------------------

export async function setMealPlanSlotAction(input: {
  plannedDate: string;
  mealSlot: MealSlot;
  recipeId: string | null;
  customMealName: string | null;
}) {
  const { supabase, household, selfPerson } = await requireHouseholdLayerEnabled();
  await upsertMealPlanSlot(supabase, {
    household_id: household.id,
    planned_date: input.plannedDate,
    meal_slot: input.mealSlot,
    recipe_id: input.recipeId,
    custom_meal_name: input.customMealName,
    created_by_person_id: selfPerson.id,
  });
  revalidateHouseholdPaths();
}

export async function removeMealPlanSlotAction(id: string) {
  const { supabase } = await requireHouseholdLayerEnabled();
  await mealPlansRepo.remove(supabase, id);
  revalidateHouseholdPaths();
}

// grocery lists --------------------------------------------------------

export async function generateGroceryListAction(title: string, startDate: string, endDate: string) {
  const { supabase, household } = await requireHouseholdLayerEnabled();
  await generateGroceryListFromMealPlan(supabase, household.id, title.trim() || "Grocery list", startDate, endDate);
  revalidateHouseholdPaths();
}

export async function toggleGroceryItemCheckedAction(itemId: string, isChecked: boolean) {
  const { supabase } = await requireHouseholdLayerEnabled();
  await groceryListItemsRepo.update(supabase, itemId, { is_checked: isChecked });
  revalidateHouseholdPaths();
}

export async function removeGroceryListAction(id: string) {
  const { supabase } = await requireHouseholdLayerEnabled();
  await groceryListsRepo.remove(supabase, id);
  revalidateHouseholdPaths();
}

// chores -------------------------------------------------------------------

export async function addChoreAction(input: {
  title: string;
  description: string;
  assignedPersonId: string | null;
  dueDate: string;
}) {
  const { supabase, household, selfPerson } = await requireHouseholdLayerEnabled();
  await choresRepo.create(supabase, {
    household_id: household.id,
    title: input.title.trim(),
    description: input.description.trim() || null,
    assigned_person_id: input.assignedPersonId,
    due_date: input.dueDate || null,
    created_by_person_id: selfPerson.id,
  });
  revalidateHouseholdPaths();
}

export async function completeChoreAction(choreId: string) {
  const { supabase, selfPerson } = await requireHouseholdLayerEnabled();
  await completeChore(supabase, choreId, selfPerson.id);
  revalidateHouseholdPaths();
}

export async function reopenChoreAction(choreId: string) {
  const { supabase } = await requireHouseholdLayerEnabled();
  await reopenChore(supabase, choreId);
  revalidateHouseholdPaths();
}

export async function removeChoreAction(id: string) {
  const { supabase } = await requireHouseholdLayerEnabled();
  await choresRepo.remove(supabase, id);
  revalidateHouseholdPaths();
}
