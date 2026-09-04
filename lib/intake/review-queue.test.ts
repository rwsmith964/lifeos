// QUEUE-039: characterization tests for correctDraftFields (lib/intake/
// review-queue.ts) -- had zero coverage before the inline correction UI
// landed, and that UI now calls this function on every Save, so pin down
// its merge-corrections / recompute-confidence / detected-record-type
// behavior with the shared fake Supabase client (lib/test-support/
// fake-supabase.ts), same pattern as lib/intake/convert.test.ts. Real RLS
// coverage for intake_drafts lives in supabase/tests/pglite/rls.test.ts.
import { describe, expect, it } from "vitest";
import { createFakeSupabaseClient, type FakeCall } from "../test-support/fake-supabase";
import { correctDraftFields, IntakeFeatureDisabledError } from "./review-queue";
import type { HouseholdRow, IntakeDraftRow } from "../db/database.types";
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
    tsa_buffer_minutes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function field(value: unknown, confidence = 0.9): ExtractedField {
  return { value, confidence };
}

function baseDraft(overrides: Partial<IntakeDraftRow> = {}): IntakeDraftRow {
  return {
    id: "draft-1",
    household_id: "household-1",
    created_by_person_id: "person-1",
    source_type: "text",
    parser_used: "generic",
    detected_record_type: "calendar_event",
    extracted_fields: {
      eventTitle: field("Dentst appt", 0.6),
      eventStartsAtISO: field("2026-09-10T15:00:00.000Z", 0.6),
      eventAllDay: field(false, 0.9),
    },
    overall_confidence: 0.6,
    source_excerpt: "dentst appt tues 8am",
    status: "needs_review",
    review_note: null,
    converted_table: null,
    converted_record_id: null,
    parsed_at: "2026-09-01T00:00:00.000Z",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("correctDraftFields", () => {
  it("merges a corrected field at confidence 1.0 and recomputes overall_confidence", async () => {
    const { client, calls } = createFakeSupabaseClient({
      feature_flags: { rows: [{ enabled: true }] },
      intake_drafts: {
        rows: [baseDraft()],
        onUpdate: (values) => ({ ...baseDraft(), ...values }),
      },
    });

    const updated = await correctDraftFields(client as never, baseHousehold(), "draft-1", { eventTitle: "Dentist appt" });

    expect(updated.extracted_fields).toMatchObject({
      eventTitle: { value: "Dentist appt", confidence: 1 },
      eventStartsAtISO: { value: "2026-09-10T15:00:00.000Z", confidence: 0.6 },
    });
    // min-confidence field (eventStartsAtISO, still 0.6) still gates
    // overall_confidence even though eventTitle was just corrected to 1.0 --
    // correcting one field doesn't silently mark the whole draft "reviewed".
    expect(updated.overall_confidence).toBe(0.6);

    const updateCall = calls.find((c: FakeCall) => c.table === "intake_drafts" && c.op === "update");
    expect(updateCall).toBeTruthy();
  });

  it("updates detected_record_type when a reclassification is passed", async () => {
    const { client } = createFakeSupabaseClient({
      feature_flags: { rows: [{ enabled: true }] },
      intake_drafts: {
        rows: [baseDraft()],
        onUpdate: (values) => ({ ...baseDraft(), ...values }),
      },
    });

    const updated = await correctDraftFields(client as never, baseHousehold(), "draft-1", {}, "moment");

    expect(updated.detected_record_type).toBe("moment");
  });

  it("leaves detected_record_type unchanged when no reclassification is passed", async () => {
    const { client } = createFakeSupabaseClient({
      feature_flags: { rows: [{ enabled: true }] },
      intake_drafts: {
        rows: [baseDraft()],
        onUpdate: (values) => ({ ...baseDraft(), ...values }),
      },
    });

    const updated = await correctDraftFields(client as never, baseHousehold(), "draft-1", { eventAllDay: true });

    expect(updated.detected_record_type).toBe("calendar_event");
  });

  it("throws instead of writing when the flag is disabled for the household", async () => {
    const { client, calls } = createFakeSupabaseClient({
      feature_flags: { rows: [] }, // maybeSingle() -> null -> isFeatureEnabled() -> false
      intake_drafts: { rows: [baseDraft()] },
    });

    await expect(correctDraftFields(client as never, baseHousehold(), "draft-1", { eventTitle: "x" })).rejects.toThrow(
      IntakeFeatureDisabledError
    );

    const updateCall = calls.find((c: FakeCall) => c.table === "intake_drafts" && c.op === "update");
    expect(updateCall).toBeUndefined();
  });

  it("throws when the draft belongs to a different household", async () => {
    const { client } = createFakeSupabaseClient({
      feature_flags: { rows: [{ enabled: true }] },
      intake_drafts: { rows: [baseDraft({ household_id: "other-household" })] },
    });

    await expect(correctDraftFields(client as never, baseHousehold(), "draft-1", { eventTitle: "x" })).rejects.toThrow(/not found/i);
  });

  it("throws when the draft has already been converted", async () => {
    const { client } = createFakeSupabaseClient({
      feature_flags: { rows: [{ enabled: true }] },
      intake_drafts: { rows: [baseDraft({ status: "converted" })] },
    });

    await expect(correctDraftFields(client as never, baseHousehold(), "draft-1", { eventTitle: "x" })).rejects.toThrow(
      /pending or needs_review/i
    );
  });

  it("throws when the draft has already been rejected", async () => {
    const { client } = createFakeSupabaseClient({
      feature_flags: { rows: [{ enabled: true }] },
      intake_drafts: { rows: [baseDraft({ status: "rejected" })] },
    });

    await expect(correctDraftFields(client as never, baseHousehold(), "draft-1", { eventTitle: "x" })).rejects.toThrow(
      /pending or needs_review/i
    );
  });
});
