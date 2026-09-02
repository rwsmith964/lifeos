// Module 7 (household_layer, D-123) display labels. Kept out of the page
// files so client components can import these without pulling in
// server-only data-access code — and so the ground rule "don't show raw
// enum values ... to the user anywhere" has exactly one place to check
// for each of this module's enums.
import type { ChoreStatus, DietaryRestriction, GroceryAisle, MealSlot } from "../db/database.types";

export const DIETARY_RESTRICTIONS: DietaryRestriction[] = [
  "vegetarian",
  "vegan",
  "pescatarian",
  "gluten_free",
  "dairy_free",
  "nut_allergy",
  "shellfish_allergy",
  "egg_allergy",
  "low_carb",
  "kosher",
  "halal",
  "other",
];

export const DIETARY_RESTRICTION_LABELS: Record<DietaryRestriction, string> = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  pescatarian: "Pescatarian",
  gluten_free: "Gluten-free",
  dairy_free: "Dairy-free",
  nut_allergy: "Nut allergy",
  shellfish_allergy: "Shellfish allergy",
  egg_allergy: "Egg allergy",
  low_carb: "Low-carb",
  kosher: "Kosher",
  halal: "Halal",
  other: "Other",
};

export const GROCERY_AISLES: GroceryAisle[] = [
  "produce",
  "dairy",
  "meat_seafood",
  "bakery",
  "frozen",
  "pantry",
  "beverages",
  "household",
  "other",
];

export const GROCERY_AISLE_LABELS: Record<GroceryAisle, string> = {
  produce: "Produce",
  dairy: "Dairy",
  meat_seafood: "Meat & seafood",
  bakery: "Bakery",
  frozen: "Frozen",
  pantry: "Pantry",
  beverages: "Beverages",
  household: "Household",
  other: "Other",
};

export const MEAL_SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

export const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

export const CHORE_STATUS_LABELS: Record<ChoreStatus, string> = {
  open: "Open",
  done: "Done",
};
