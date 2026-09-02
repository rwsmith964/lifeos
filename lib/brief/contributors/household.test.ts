// Module 8 (brief_registration_v2, D-1XX): characterization tests for the
// household contributor. Uses the shared fake Supabase client -- real RLS
// coverage for meal_plans/chores lives in supabase/tests/pglite/rls.test.ts.
import { describe, expect, it } from "vitest";
import { createFakeSupabaseClient } from "../../test-support/fake-supabase";
import { householdContributor } from "./household";
import type { ChoreRow, MealPlanRow } from "../../db/database.types";

const HOUSEHOLD_ID = "household-1";
const TODAY = new Date("2026-09-01T12:00:00.000Z");

function mealPlan(overrides: Partial<MealPlanRow> = {}): MealPlanRow {
  return {
    id: "meal-1",
    household_id: HOUSEHOLD_ID,
    planned_date: "2026-09-01",
    meal_slot: "dinner",
    recipe_id: null,
    custom_meal_name: "Tacos",
    created_by_person_id: "person-1",
    created_at: "2026-08-30T00:00:00.000Z",
    ...overrides,
  };
}

function chore(overrides: Partial<ChoreRow> = {}): ChoreRow {
  return {
    id: "chore-1",
    household_id: HOUSEHOLD_ID,
    title: "Take out trash",
    description: null,
    assigned_person_id: null,
    due_date: "2026-09-01",
    status: "open",
    completed_by_person_id: null,
    completed_at: null,
    created_by_person_id: "person-1",
    created_at: "2026-08-30T00:00:00.000Z",
    updated_at: "2026-08-30T00:00:00.000Z",
    ...overrides,
  };
}

function ctxWith(rows: { feature_flags?: unknown[]; meal_plans?: MealPlanRow[]; chores?: ChoreRow[] }) {
  const { client } = createFakeSupabaseClient({
    feature_flags: { rows: rows.feature_flags ?? [] },
    meal_plans: { rows: rows.meal_plans ?? [] },
    chores: { rows: rows.chores ?? [] },
  });
  return { supabase: client as never, householdId: HOUSEHOLD_ID, personId: "person-1", today: TODAY };
}

describe("householdContributor", () => {
  it("returns nothing when household_layer is disabled", async () => {
    const ctx = ctxWith({
      feature_flags: [],
      meal_plans: [],
      chores: [chore({ status: "open", due_date: "2026-08-30" })],
    });
    expect(await householdContributor(ctx)).toEqual([]);
  });

  it("flags a missing dinner plan for today when household_layer is enabled", async () => {
    const ctx = ctxWith({ feature_flags: [{ enabled: true }], meal_plans: [], chores: [] });
    const items = await householdContributor(ctx);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ category: "household", id: "household:dinner-gap" });
  });

  it("does not flag dinner when a dinner slot is already planned for today", async () => {
    const ctx = ctxWith({
      feature_flags: [{ enabled: true }],
      meal_plans: [mealPlan({ meal_slot: "dinner", planned_date: "2026-09-01" })],
      chores: [],
    });
    const items = await householdContributor(ctx);
    expect(items.find((i) => i.id === "household:dinner-gap")).toBeUndefined();
  });

  it("surfaces overdue chores with higher priority than chores due today", async () => {
    const ctx = ctxWith({
      feature_flags: [{ enabled: true }],
      meal_plans: [mealPlan()],
      chores: [
        chore({ id: "overdue-1", due_date: "2026-08-28", title: "Water plants" }),
        chore({ id: "today-1", due_date: "2026-09-01", title: "Take out trash" }),
      ],
    });
    const items = await householdContributor(ctx);
    const overdue = items.find((i) => i.id === "household:chore:overdue-1");
    const dueToday = items.find((i) => i.id === "household:chore:today-1");
    expect(overdue).toBeTruthy();
    expect(dueToday).toBeTruthy();
    expect(overdue!.priority).toBeGreaterThan(dueToday!.priority);
    expect(overdue!.title).toContain("overdue");
    expect(dueToday!.title).toContain("due today");
  });

  it("ignores chores due in the future and chores without a due date", async () => {
    const ctx = ctxWith({
      feature_flags: [{ enabled: true }],
      meal_plans: [mealPlan()],
      chores: [
        chore({ id: "future-1", due_date: "2026-09-10" }),
        chore({ id: "no-date-1", due_date: null }),
      ],
    });
    const items = await householdContributor(ctx);
    expect(items.find((i) => i.id === "household:chore:future-1")).toBeUndefined();
    expect(items.find((i) => i.id === "household:chore:no-date-1")).toBeUndefined();
  });
});
