// Module 7 (D-123): characterization tests for the "recipe" branch of
// convertDraftToRecord (lib/intake/convert.ts), added when the recipe
// destination table (Module 7's `recipes`) landed. Uses the shared fake
// Supabase client (lib/test-support/fake-supabase.ts) rather than a real
// Postgres connection -- real RLS coverage for the `recipes` table lives
// in supabase/tests/pglite/rls.test.ts.
import { describe, expect, it } from "vitest";
import { createFakeSupabaseClient, type FakeCall } from "../test-support/fake-supabase";
import { convertDraftToRecord, type ConvertContext } from "./convert";
import type { HouseholdRow, IntakeDraftRow, PersonRow } from "../db/database.types";
import type { ExtractedField } from "./confidence";

function baseHousehold(overrides: Partial<HouseholdRow> = {}): HouseholdRow {
  return {
    id: "household-1",
    name: "Smith Household",
    default_gift_budget_min_cents: null,
    default_gift_budget_max_cents: null,
    gift_scan_horizon_days: 30,
    gift_prompt_buffer_days: 7,
    gift_handling_buffer_days: 3,
    gift_personal_buffer_days: 1,
    ai_daily_spend_ceiling_cents: 500,
    brief_time: "07:00",
    notification_channels: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseSelfPerson(overrides: Partial<PersonRow> = {}): PersonRow {
  return {
    id: "person-1",
    household_id: "household-1",
    user_id: "user-1",
    full_name: "Richard Smith",
    nickname: null,
    relationship_type: "self",
    birthdate: null,
    birth_year_known: false,
    anniversary: null,
    phone: null,
    email: null,
    photo_url: null,
    notes: "",
    is_archived: false,
    is_childcare_provider: false,
    address: null,
    address_lat: null,
    address_lng: null,
    show_work_schedule_on_calendar: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function field(value: unknown, confidence = 0.9): ExtractedField {
  return { value, confidence };
}

function recipeDraft(overrides: Partial<IntakeDraftRow> = {}): IntakeDraftRow {
  return {
    id: "draft-1",
    household_id: "household-1",
    created_by_person_id: "person-1",
    source_type: "image",
    parser_used: "generic",
    detected_record_type: "recipe",
    extracted_fields: {
      recipeTitle: field("Tacos"),
      recipeIngredients: field("1 lb beef\ntortillas"),
      recipeInstructions: field("Brown the beef, warm the tortillas, assemble."),
      recipeServings: field(4),
      recipeSourceUrl: field(null),
    },
    overall_confidence: 0.9,
    source_excerpt: "photo of a handwritten recipe card",
    status: "ready",
    review_note: null,
    converted_table: null,
    converted_record_id: null,
    parsed_at: "2026-09-01T00:00:00.000Z",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("convertDraftToRecord (recipe branch, Module 7)", () => {
  it("converts a recipe draft into a recipes row when household_layer is enabled", async () => {
    const { client, calls } = createFakeSupabaseClient({
      // Both isFeatureEnabled checks (household_layer here, universal_intake_v2
      // inside withActionLog) read this same table -- enabled for both is fine,
      // this test is about the recipe conversion, not the action-log gate.
      feature_flags: { rows: [{ enabled: true }] },
      recipes: {
        onInsert: (values) => ({ id: "recipe-1", ...values }),
        rows: [{ id: "recipe-1", title: "Tacos", household_id: "household-1" }],
      },
      action_log: {},
    });

    const ctx: ConvertContext = { supabase: client as never, household: baseHousehold(), selfPerson: baseSelfPerson() };
    const outcome = await convertDraftToRecord(ctx, recipeDraft());

    expect(outcome.table).toBe("recipes");
    expect(outcome.recordId).toBe("recipe-1");
    expect(outcome.confirmationMessage).toContain("Tacos");

    const insertCall = calls.find((c: FakeCall) => c.table === "recipes" && c.op === "insert");
    expect(insertCall).toBeTruthy();
    const inserted = insertCall!.values as Record<string, unknown>;
    expect(inserted.household_id).toBe("household-1");
    expect(inserted.created_by_person_id).toBe("person-1");
    expect(inserted.title).toBe("Tacos");
    expect(inserted.ingredients).toBe("1 lb beef\ntortillas");
    expect(inserted.instructions).toBe("Brown the beef, warm the tortillas, assemble.");
    expect(inserted.servings).toBe(4);
    expect(inserted.source_url).toBeNull();
  });

  it("throws instead of writing when household_layer is disabled for the household", async () => {
    const { client, calls } = createFakeSupabaseClient({
      feature_flags: { rows: [] }, // maybeSingle() -> null -> isFeatureEnabled() -> false
      recipes: {},
      action_log: {},
    });

    const ctx: ConvertContext = { supabase: client as never, household: baseHousehold(), selfPerson: baseSelfPerson() };

    await expect(convertDraftToRecord(ctx, recipeDraft())).rejects.toThrow(/household layer is enabled/i);

    const insertCall = calls.find((c: FakeCall) => c.table === "recipes" && c.op === "insert");
    expect(insertCall).toBeUndefined();
  });

  it("throws when the draft is missing a required field (recipeTitle)", async () => {
    const { client } = createFakeSupabaseClient({
      feature_flags: { rows: [{ enabled: true }] },
      recipes: { onInsert: (values) => ({ id: "recipe-2", ...values }) },
      action_log: {},
    });

    const ctx: ConvertContext = { supabase: client as never, household: baseHousehold(), selfPerson: baseSelfPerson() };
    const draft = recipeDraft({
      extracted_fields: {
        recipeIngredients: field("salt"),
      },
    });

    await expect(convertDraftToRecord(ctx, draft)).rejects.toThrow();
  });
});
