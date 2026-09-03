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
    calendar_hide_other_parent_custody: true,
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

// R-1 (D-142): characterization tests for the "flight" branch --
// itinerary-aware trip planning (TSA cutoff / drive time / pack-by
// cascade, plus a childcare cross-reference), see lib/intake/trip-cascade.ts.
function flightDraft(overrides: Partial<IntakeDraftRow> = {}): IntakeDraftRow {
  return {
    id: "draft-2",
    household_id: "household-1",
    created_by_person_id: "person-1",
    source_type: "screenshot",
    parser_used: "generic",
    detected_record_type: "flight",
    extracted_fields: {
      flightAirline: field("Delta"),
      flightNumber: field("DL123"),
      flightDepartureAirport: field("PDX"),
      flightDepartureAtISO: field("2026-09-15T08:00:00.000Z"),
      flightArrivalAirport: field("DEN"),
      flightArrivalAtISO: field("2026-09-15T11:00:00.000Z"),
    },
    overall_confidence: 0.9,
    source_excerpt: "boarding pass screenshot",
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

describe("convertDraftToRecord (flight branch, R-1/D-142)", () => {
  it("creates the flight as a travel calendar event and derives a pack/security-cutoff cascade with no home address on file", async () => {
    const { client, calls } = createFakeSupabaseClient({
      feature_flags: { rows: [{ enabled: true }] },
      calendar_events: {
        onInsert: (values) => ({ id: "event-1", ...values }),
        rows: [{ id: "event-1", title: "Delta DL123 to DEN", all_day: false }],
      },
      action_log: {},
      intake_drafts: {},
      people: { rows: [] },
      childcare_requests: { rows: [] },
    });

    // ctx.userId omitted -- no home address to look up, so the cascade
    // must degrade gracefully (no "leave for the airport" event, no
    // network calls) rather than throwing.
    const ctx: ConvertContext = { supabase: client as never, household: baseHousehold(), selfPerson: baseSelfPerson() };
    const outcome = await convertDraftToRecord(ctx, flightDraft());

    expect(outcome.table).toBe("calendar_events");
    expect(outcome.recordId).toBe("event-1");
    expect(outcome.confirmationMessage).toContain("Delta DL123 to DEN");
    expect(outcome.confirmationMessage).toContain("draft reminder");
    expect(outcome.confirmationMessage).toContain("No confirmed childcare coverage");

    const eventInsert = calls.find((c: FakeCall) => c.table === "calendar_events" && c.op === "insert");
    expect(eventInsert).toBeTruthy();
    const insertedEvent = eventInsert!.values as Record<string, unknown>;
    expect(insertedEvent.event_type).toBe("travel");
    expect(insertedEvent.starts_at).toBe("2026-09-15T08:00:00.000Z");
    expect(insertedEvent.ends_at).toBe("2026-09-15T11:00:00.000Z");
    expect(insertedEvent.all_day).toBe(false);

    // No home address -> no drive-time estimate -> only the security
    // cutoff and pack-reminder drafts, not a "leave for the airport" one.
    const draftInserts = calls.filter((c: FakeCall) => c.table === "intake_drafts" && c.op === "insert");
    expect(draftInserts).toHaveLength(2);
    const titles = draftInserts.map((c) => (c.values as Record<string, unknown>).extracted_fields as Record<string, ExtractedField>).map((f) => f.eventTitle.value);
    expect(titles).toContain("Arrive at PDX (security cutoff)");
    expect(titles).toContain("Pack for the trip");
    expect(titles.some((t) => String(t).startsWith("Leave for"))).toBe(false);
  });

  it("surfaces accepted childcare coverage overlapping the trip window in the confirmation message", async () => {
    const { client } = createFakeSupabaseClient({
      feature_flags: { rows: [{ enabled: true }] },
      calendar_events: {
        onInsert: (values) => ({ id: "event-2", ...values }),
        rows: [{ id: "event-2", title: "Delta DL123 to DEN", all_day: false }],
      },
      action_log: {},
      intake_drafts: {},
      people: {
        rows: [
          { id: "provider-1", full_name: "Grandma Smith", nickname: "Grandma" },
          { id: "child-1", full_name: "Cal Smith", nickname: "Cal" },
        ],
      },
      childcare_requests: {
        rows: [
          {
            id: "cc-1",
            household_id: "household-1",
            requested_by_person_id: "person-1",
            provider_person_id: "provider-1",
            child_person_ids: ["child-1"],
            care_date: "2026-09-15",
            care_start_time: "08:00",
            care_end_time: "20:00",
            event_title: null,
            custom_note: null,
            status: "accepted",
            token: "tok",
            drive_minutes_to_provider: null,
            drive_time_source: null,
            responded_at: "2026-09-02T00:00:00.000Z",
            created_at: "2026-09-01T00:00:00.000Z",
            updated_at: "2026-09-01T00:00:00.000Z",
            expires_at: "2026-09-10T00:00:00.000Z",
          },
        ],
      },
    });

    const ctx: ConvertContext = { supabase: client as never, household: baseHousehold(), selfPerson: baseSelfPerson() };
    const outcome = await convertDraftToRecord(ctx, flightDraft());

    expect(outcome.confirmationMessage).toContain("Grandma covers Cal");
    expect(outcome.confirmationMessage).not.toContain("No confirmed childcare coverage");
  });

  it("throws when the draft is missing a required field (flightDepartureAtISO)", async () => {
    const { client } = createFakeSupabaseClient({
      feature_flags: { rows: [{ enabled: true }] },
      calendar_events: { onInsert: (values) => ({ id: "event-3", ...values }) },
      action_log: {},
    });

    const ctx: ConvertContext = { supabase: client as never, household: baseHousehold(), selfPerson: baseSelfPerson() };
    const draft = flightDraft({
      extracted_fields: {
        flightDepartureAirport: field("PDX"),
      },
    });

    await expect(convertDraftToRecord(ctx, draft)).rejects.toThrow();
  });
});
