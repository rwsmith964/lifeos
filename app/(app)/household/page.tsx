// Module 7 — Household Layer (D-123, household_layer flag). Direct-URL-only,
// no nav link — same posture as /ambient (Module 5) and /execution (Module 6);
// see QUEUE-028 for the reasoning specific to this module.
//
// Deliberately thin per the brief (§9, no gold-plating the household
// layer): meal planning + dietary preferences + pantry awareness, an
// aisle-organized grocery list generated from the meal plan, and chores
// with assignment/completion. Recipes are captured either directly here
// or through the Module 3 intake pipeline (lib/intake/convert.ts's
// "recipe" case).
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { requireHouseholdContext } from "@/lib/auth/session";
import { getZonedNow } from "@/lib/timezones";
import { isFeatureEnabled } from "@/lib/flags";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import {
  listChoresForHousehold,
  listDietaryPreferencesForHousehold,
  listGroceryListItems,
  listGroceryListsForHousehold,
  listMealPlansForRange,
  listPantryItemsForHousehold,
  listRecipesForHousehold,
} from "@/lib/db/repositories/household";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DietaryPreferencesCard } from "./dietary-preferences-card";
import { PantryCard } from "./pantry-card";
import { RecipesCard } from "./recipes-card";
import { MealPlanCard } from "./meal-plan-card";
import { GroceryListsCard } from "./grocery-lists-card";
import { ChoresCard } from "./chores-card";

export const metadata = {
  title: "Household — LifeOS",
};

export default async function HouseholdPage() {
  const { supabase, household, timezone } = await requireHouseholdContext();

  const enabled = await isFeatureEnabled(supabase, household.id, "household_layer");
  if (!enabled) {
    notFound();
  }

  // D-143: household-local today, not a bare `new Date()` -- see
  // lib/timezones.ts's getZonedNow for why.
  const today = getZonedNow(timezone);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return format(d, "yyyy-MM-dd");
  });
  const startDate = days[0];
  const endDate = days[days.length - 1];

  const [people, dietaryPreferences, pantryItems, recipes, mealPlans, groceryLists, chores] = await Promise.all([
    listPeopleForHousehold(supabase, household.id),
    listDietaryPreferencesForHousehold(supabase, household.id),
    listPantryItemsForHousehold(supabase, household.id),
    listRecipesForHousehold(supabase, household.id),
    listMealPlansForRange(supabase, household.id, startDate, endDate),
    listGroceryListsForHousehold(supabase, household.id),
    listChoresForHousehold(supabase, household.id),
  ]);

  const activePeople = people.filter((p) => !p.is_archived);

  const itemsByListId: Record<string, Awaited<ReturnType<typeof listGroceryListItems>>> = {};
  await Promise.all(
    groceryLists.slice(0, 10).map(async (list) => {
      itemsByListId[list.id] = await listGroceryListItems(supabase, list.id);
    })
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">Household</h1>
        <p className="text-sm text-muted-foreground">
          Meal planning, groceries, and chores — the everyday stuff, kept simple.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dietary preferences</CardTitle>
          <CardDescription>Restrictions and preferences the meal planner can take into account.</CardDescription>
        </CardHeader>
        <CardContent>
          <DietaryPreferencesCard people={activePeople} preferences={dietaryPreferences} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pantry</CardTitle>
          <CardDescription>What&apos;s already on hand — skipped automatically on generated grocery lists.</CardDescription>
        </CardHeader>
        <CardContent>
          <PantryCard items={pantryItems} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recipes</CardTitle>
          <CardDescription>Saved recipes to plan meals with.</CardDescription>
        </CardHeader>
        <CardContent>
          <RecipesCard recipes={recipes} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Meal plan — next 7 days</CardTitle>
          <CardDescription>Plan a recipe or a freeform meal for any slot.</CardDescription>
        </CardHeader>
        <CardContent>
          <MealPlanCard days={days} plans={mealPlans} recipes={recipes} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Grocery lists</CardTitle>
          <CardDescription>Generate an aisle-organized list from the meal plan above.</CardDescription>
        </CardHeader>
        <CardContent>
          <GroceryListsCard
            lists={groceryLists}
            itemsByListId={itemsByListId}
            defaultStartDate={startDate}
            defaultEndDate={endDate}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Chores</CardTitle>
          <CardDescription>Assign and track completion — no recurrence engine, just add it again next time.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChoresCard chores={chores} people={activePeople} />
        </CardContent>
      </Card>
    </div>
  );
}
