// Module 7 (household_layer, D-123) repositories. Every table here is
// additive (supabase/migrations/20260901000007_module7_household_layer.sql)
// and every write in this file goes through RLS on the caller's own
// request-scoped client — no service-role bypass, same as every other
// repository in this directory.
//
// Deliberately thin per the brief (§9, no gold-plating the household
// layer): the only non-trivial logic is grocery-list generation, which
// reads meal_plans + recipes + pantry_items and writes grocery_list_items
// — plain application code, no DB trigger/function.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createRepository } from "../repository";
import type {
  ChoreInsert,
  ChoreRow,
  ChoreStatus,
  ChoreUpdate,
  DietaryPreferenceInsert,
  DietaryPreferenceRow,
  DietaryRestriction,
  GroceryAisle,
  GroceryListInsert,
  GroceryListItemInsert,
  GroceryListItemRow,
  GroceryListItemUpdate,
  GroceryListRow,
  GroceryListUpdate,
  MealPlanInsert,
  MealPlanRow,
  MealPlanUpdate,
  PantryItemInsert,
  PantryItemRow,
  PantryItemUpdate,
  RecipeInsert,
  RecipeRow,
  RecipeUpdate,
} from "../database.types";

export const dietaryPreferencesRepo = createRepository<
  DietaryPreferenceRow,
  DietaryPreferenceInsert,
  never
>("dietary_preferences");

export const pantryItemsRepo = createRepository<PantryItemRow, PantryItemInsert, PantryItemUpdate>("pantry_items");

export const recipesRepo = createRepository<RecipeRow, RecipeInsert, RecipeUpdate>("recipes");

export const mealPlansRepo = createRepository<MealPlanRow, MealPlanInsert, MealPlanUpdate>("meal_plans");

export const groceryListsRepo = createRepository<GroceryListRow, GroceryListInsert, GroceryListUpdate>(
  "grocery_lists"
);

export const groceryListItemsRepo = createRepository<
  GroceryListItemRow,
  GroceryListItemInsert,
  GroceryListItemUpdate
>("grocery_list_items");

export const choresRepo = createRepository<ChoreRow, ChoreInsert, ChoreUpdate>("chores");

// dietary_preferences --------------------------------------------------

export async function listDietaryPreferencesForHousehold(
  client: SupabaseClient,
  householdId: string
): Promise<DietaryPreferenceRow[]> {
  return dietaryPreferencesRepo.list(client, (q) => q.eq("household_id", householdId));
}

export async function addDietaryPreference(
  client: SupabaseClient,
  householdId: string,
  personId: string,
  restriction: DietaryRestriction,
  notes: string | null
): Promise<DietaryPreferenceRow> {
  return dietaryPreferencesRepo.create(client, {
    household_id: householdId,
    person_id: personId,
    restriction,
    notes,
  });
}

export async function removeDietaryPreference(client: SupabaseClient, id: string): Promise<void> {
  await dietaryPreferencesRepo.remove(client, id);
}

// pantry_items -----------------------------------------------------------

export async function listPantryItemsForHousehold(
  client: SupabaseClient,
  householdId: string
): Promise<PantryItemRow[]> {
  return pantryItemsRepo.list(client, (q) => q.eq("household_id", householdId).order("name", { ascending: true }));
}

// recipes ------------------------------------------------------------------

export async function listRecipesForHousehold(client: SupabaseClient, householdId: string): Promise<RecipeRow[]> {
  return recipesRepo.list(client, (q) => q.eq("household_id", householdId).order("created_at", { ascending: false }));
}

// meal_plans ---------------------------------------------------------------

/** Every planned meal in [startDate, endDate] inclusive, ISO yyyy-mm-dd. */
export async function listMealPlansForRange(
  client: SupabaseClient,
  householdId: string,
  startDate: string,
  endDate: string
): Promise<MealPlanRow[]> {
  return mealPlansRepo.list(client, (q) =>
    q.eq("household_id", householdId).gte("planned_date", startDate).lte("planned_date", endDate)
  );
}

/** One row per (household, date, slot) — upsert so re-planning a slot replaces the prior entry rather than erroring on the unique constraint. */
export async function upsertMealPlanSlot(
  client: SupabaseClient,
  values: MealPlanInsert
): Promise<MealPlanRow> {
  return mealPlansRepo.upsert(client, values, "household_id,planned_date,meal_slot");
}

// grocery_lists / grocery_list_items ---------------------------------------

export async function listGroceryListsForHousehold(
  client: SupabaseClient,
  householdId: string
): Promise<GroceryListRow[]> {
  return groceryListsRepo.list(client, (q) =>
    q.eq("household_id", householdId).order("created_at", { ascending: false })
  );
}

export async function listGroceryListItems(
  client: SupabaseClient,
  groceryListId: string
): Promise<GroceryListItemRow[]> {
  return groceryListItemsRepo.list(client, (q) =>
    q.eq("grocery_list_id", groceryListId).order("aisle", { ascending: true })
  );
}

/**
 * Generate a grocery list from every meal_plans row in [startDate, endDate]
 * that points at a recipe (custom_meal_name entries have no ingredients to
 * pull from, so they're skipped). Splits each recipe's `ingredients` field
 * on newlines into one grocery_list_items row per non-blank line, then
 * drops any line whose text already matches an in-stock pantry_items name
 * (case-insensitive substring match) — this is the "pantry awareness" the
 * brief calls for. No unit/quantity parsing, no dedup across recipes: two
 * recipes both calling for "onion" produce two list lines, since merging
 * quantities correctly would require parsing units the source text doesn't
 * reliably provide, and a household can just check off one manually.
 */
export async function generateGroceryListFromMealPlan(
  client: SupabaseClient,
  householdId: string,
  title: string,
  startDate: string,
  endDate: string
): Promise<{ list: GroceryListRow; items: GroceryListItemRow[] }> {
  const [plans, pantry] = await Promise.all([
    listMealPlansForRange(client, householdId, startDate, endDate),
    listPantryItemsForHousehold(client, householdId),
  ]);

  const recipeIds = Array.from(new Set(plans.map((p) => p.recipe_id).filter((id): id is string => id !== null)));
  const recipes = recipeIds.length > 0 ? await recipesRepo.list(client, (q) => q.in("id", recipeIds)) : [];
  const recipeById = new Map(recipes.map((r) => [r.id, r]));
  const pantryNames = pantry.map((p) => p.name.toLowerCase());

  const list = await groceryListsRepo.create(client, {
    household_id: householdId,
    title,
    generated_from_meal_plan: true,
  });

  const itemInserts: GroceryListItemInsert[] = [];
  for (const plan of plans) {
    if (!plan.recipe_id) continue;
    const recipe = recipeById.get(plan.recipe_id);
    if (!recipe) continue;
    const lines = recipe.ingredients
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    for (const line of lines) {
      const inPantry = pantryNames.some((name) => line.toLowerCase().includes(name));
      if (inPantry) continue;
      itemInserts.push({
        household_id: householdId,
        grocery_list_id: list.id,
        name: line,
        source_recipe_id: recipe.id,
      } as GroceryListItemInsert & { household_id: string; grocery_list_id: string });
    }
  }

  const items = itemInserts.length > 0 ? await groceryListItemsRepo.createMany(client, itemInserts) : [];
  return { list, items };
}

// chores -------------------------------------------------------------------

export async function listChoresForHousehold(
  client: SupabaseClient,
  householdId: string,
  status?: ChoreStatus
): Promise<ChoreRow[]> {
  return choresRepo.list(client, (q) => {
    let query = q.eq("household_id", householdId).order("due_date", { ascending: true, nullsFirst: false });
    if (status) query = query.eq("status", status);
    return query;
  });
}

export async function completeChore(
  client: SupabaseClient,
  choreId: string,
  completedByPersonId: string
): Promise<ChoreRow> {
  return choresRepo.update(client, choreId, {
    status: "done",
    completed_by_person_id: completedByPersonId,
    completed_at: new Date().toISOString(),
  });
}

export async function reopenChore(client: SupabaseClient, choreId: string): Promise<ChoreRow> {
  return choresRepo.update(client, choreId, {
    status: "open",
    completed_by_person_id: null,
    completed_at: null,
  });
}

export type { GroceryAisle };
