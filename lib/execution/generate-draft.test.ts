// Module 6 (execution_draft_only, D-122) acceptance tests for
// proposeExecutionDraft — the brief's two hard requirements: a
// default-excluded category allowlist, and a hard client-facing
// exclusion nothing can override for a colleague.
import { describe, expect, it } from "vitest";
import { createFakeSupabaseClient } from "../test-support/fake-supabase";
import {
  effectiveIsBusinessContact,
  ExecutionDraftRejectedError,
  proposeExecutionDraft,
  templateForCategory,
} from "./generate-draft";
import type { PersonRow } from "../db/database.types";

const HOUSEHOLD_ID = "11111111-1111-1111-1111-111111111111";
const FRIEND_ID = "22222222-2222-2222-2222-222222222222";
const COLLEAGUE_ID = "33333333-3333-3333-3333-333333333333";

function friendPerson(overrides: Partial<PersonRow> = {}): PersonRow {
  return {
    id: FRIEND_ID,
    household_id: HOUSEHOLD_ID,
    user_id: null,
    full_name: "Alex Friend",
    nickname: null,
    relationship_type: "friend",
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
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("proposeExecutionDraft (Module 6, D-122)", () => {
  it("rejects a category with no execution_categories row at all — default excluded, not a blocklist", async () => {
    const { client, calls } = createFakeSupabaseClient({
      execution_categories: { rows: [] },
    });

    await expect(
      proposeExecutionDraft(client as never, {
        householdId: HOUSEHOLD_ID,
        category: "rsvp",
        contactPersonId: null,
        draftBody: "test",
      })
    ).rejects.toThrow(ExecutionDraftRejectedError);

    expect(calls.some((c) => c.table === "execution_drafts" && c.op === "insert")).toBe(false);
  });

  it("rejects a category explicitly disabled (enabled=false row present)", async () => {
    const { client } = createFakeSupabaseClient({
      execution_categories: { rows: [{ household_id: HOUSEHOLD_ID, category: "rsvp", enabled: false }] },
    });

    await expect(
      proposeExecutionDraft(client as never, {
        householdId: HOUSEHOLD_ID,
        category: "rsvp",
        contactPersonId: null,
        draftBody: "test",
      })
    ).rejects.toMatchObject({ reason: "category_not_allowed" });
  });

  it("hard-excludes a colleague even when explicitly marked is_business_contact=false", async () => {
    const { client, calls } = createFakeSupabaseClient({
      execution_categories: { rows: [{ household_id: HOUSEHOLD_ID, category: "rsvp", enabled: true }] },
      people: { rows: [friendPerson({ id: COLLEAGUE_ID, relationship_type: "colleague" })] },
      contact_execution_settings: {
        rows: [{ household_id: HOUSEHOLD_ID, person_id: COLLEAGUE_ID, is_business_contact: false }],
      },
    });

    await expect(
      proposeExecutionDraft(client as never, {
        householdId: HOUSEHOLD_ID,
        category: "rsvp",
        contactPersonId: COLLEAGUE_ID,
        draftBody: "test",
      })
    ).rejects.toMatchObject({ reason: "client_facing_excluded" });

    expect(calls.some((c) => c.table === "execution_drafts" && c.op === "insert")).toBe(false);
  });

  it("excludes a non-colleague explicitly flagged as a business contact", async () => {
    const { client } = createFakeSupabaseClient({
      execution_categories: { rows: [{ household_id: HOUSEHOLD_ID, category: "gift_order", enabled: true }] },
      people: { rows: [friendPerson()] },
      contact_execution_settings: {
        rows: [{ household_id: HOUSEHOLD_ID, person_id: FRIEND_ID, is_business_contact: true }],
      },
    });

    await expect(
      proposeExecutionDraft(client as never, {
        householdId: HOUSEHOLD_ID,
        category: "gift_order",
        contactPersonId: FRIEND_ID,
        draftBody: "test",
      })
    ).rejects.toMatchObject({ reason: "client_facing_excluded" });
  });

  it("creates a draft for an enabled category and a non-excluded contact", async () => {
    const { client, calls } = createFakeSupabaseClient({
      execution_categories: { rows: [{ household_id: HOUSEHOLD_ID, category: "rsvp", enabled: true }] },
      people: { rows: [friendPerson()] },
      contact_execution_settings: { rows: [] },
      execution_drafts: {
        onInsert: (values) => ({ id: "draft-1", status: "pending_review", ...values }),
      },
    });

    const draft = await proposeExecutionDraft(client as never, {
      householdId: HOUSEHOLD_ID,
      category: "rsvp",
      contactPersonId: FRIEND_ID,
      draftBody: "We'll be there!",
    });

    expect(draft.status).toBe("pending_review");
    const insertCall = calls.find((c) => c.table === "execution_drafts" && c.op === "insert");
    expect(insertCall?.values).toMatchObject({
      household_id: HOUSEHOLD_ID,
      category: "rsvp",
      contact_person_id: FRIEND_ID,
      draft_body: "We'll be there!",
    });
  });

  it("allows a contactPersonId of null (e.g. a vendor gift-order confirmation) when the category is enabled", async () => {
    const { client, calls } = createFakeSupabaseClient({
      execution_categories: { rows: [{ household_id: HOUSEHOLD_ID, category: "gift_order", enabled: true }] },
      execution_drafts: {
        onInsert: (values) => ({ id: "draft-2", status: "pending_review", ...values }),
      },
    });

    const draft = await proposeExecutionDraft(client as never, {
      householdId: HOUSEHOLD_ID,
      category: "gift_order",
      contactPersonId: null,
      draftBody: "Confirming the order.",
    });

    expect(draft.status).toBe("pending_review");
    expect(calls.some((c) => c.table === "people")).toBe(false);
  });

  it("effectiveIsBusinessContact treats a colleague as excluded with no settings row at all", async () => {
    const { client } = createFakeSupabaseClient({ contact_execution_settings: { rows: [] } });
    const excluded = await effectiveIsBusinessContact(
      client as never,
      HOUSEHOLD_ID,
      friendPerson({ id: COLLEAGUE_ID, relationship_type: "colleague" })
    );
    expect(excluded).toBe(true);
  });

  it("effectiveIsBusinessContact defaults a plain friend with no settings row to not excluded", async () => {
    const { client } = createFakeSupabaseClient({ contact_execution_settings: { rows: [] } });
    const excluded = await effectiveIsBusinessContact(client as never, HOUSEHOLD_ID, friendPerson());
    expect(excluded).toBe(false);
  });
});

describe("templateForCategory (Module 6, D-122)", () => {
  it("returns non-empty deterministic starter text for every category", () => {
    for (const category of ["rsvp", "reschedule", "confirmation", "gift_order"] as const) {
      const text = templateForCategory(category, "Jamie");
      expect(text.length).toBeGreaterThan(0);
    }
  });

  it("falls back to a generic greeting when no contact name is given", () => {
    expect(templateForCategory("rsvp", null)).toContain("there");
  });
});
