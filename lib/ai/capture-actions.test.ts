// Characterization tests for executeAction (Additive Contract rule 4:
// "capture current behavior before writing new modules touching it") --
// written before Module 3 (D-119) extends this function's return type so
// lib/intake/convert.ts and the Quick Capture verified-completion wiring
// can know what was written. Every pre-existing call site
// (app/api/capture/route.ts, app/api/brain-dump/execute/route.ts) does
// `await executeAction(...)` and never reads a return value, so these
// tests pin down the WRITES each action type performs -- the part that
// must never change -- while the return-value assertions below document
// the new (additive) descriptor Module 3 adds on top.
import { describe, expect, it, vi } from "vitest";

// No network in tests: pretend every address resolves to the same spot.
vi.mock("@/lib/calendar/geocode-event", () => ({
  coordinatesForLocation: async (location: string | null | undefined) => (location ? { lat: 1.5, lng: 2.5 } : null),
}));

import { executeAction, isKnownPersonId } from "./capture-actions";
import { createFakeSupabaseClient } from "../test-support/fake-supabase";
import type { HouseholdRow, PersonRow } from "../db/database.types";

const household: HouseholdRow = {
  id: "household-1",
  name: "Test Household",
  default_gift_budget_min_cents: 2000,
  default_gift_budget_max_cents: 5000,
} as HouseholdRow;

const selfPerson: PersonRow = { id: "person-self" } as PersonRow;

describe("executeAction", () => {
  it("create_calendar_event writes a calendar_events row and returns its descriptor", async () => {
    const { client, calls } = createFakeSupabaseClient({
      calendar_events: { onInsert: (v) => ({ id: "event-1", ...v }) },
    });

    const result = await executeAction(client as never, household, selfPerson, {
      type: "create_calendar_event",
      personId: null,
      personName: null,
      personRelationshipTypeGuess: null,
      personNotes: null,
      activityType: null,
      activityNotes: null,
      interest: null,
      interestStrength: null,
      interactionType: null,
      interactionNotes: null,
      giftDescription: null,
      giftOccasionType: null,
      giftOccasionDate: null,
      giftCostDollars: null,
      eventTitle: "Dentist",
      eventStartsAtISO: "2026-09-05T15:00:00.000Z",
      eventEndsAtISO: "2026-09-05T16:00:00.000Z",
      eventAllDay: false,
      eventType: "personal",
      noteText: null,
      budgetOccasionType: null,
      budgetMinDollars: null,
      budgetMaxDollars: null,
      timeOffStartDate: null,
      timeOffEndDate: null,
      timeOffReason: null,
      timeOffDestination: null,
    });

    const insertCall = calls.find((c) => c.table === "calendar_events" && c.op === "insert");
    expect(insertCall).toBeDefined();
    expect((insertCall!.values as Record<string, unknown>).title).toBe("Dentist");
    // Additive: the descriptor Module 3 adds. Pre-existing callers ignore
    // this return value entirely, so adding it changes nothing for them.
    expect(result).toEqual({ table: "calendar_events", id: "event-1" });
  });

  const eventAction = (over: Record<string, unknown>) =>
    ({
      type: "create_calendar_event",
      personId: null,
      personName: null,
      personRelationshipTypeGuess: null,
      personNotes: null,
      activityType: null,
      activityNotes: null,
      interest: null,
      interestStrength: null,
      interactionType: null,
      interactionNotes: null,
      giftDescription: null,
      giftOccasionType: null,
      giftOccasionDate: null,
      giftCostDollars: null,
      eventTitle: "Brittney stays over",
      eventStartsAtISO: "2026-11-14T16:30:00.000Z",
      eventEndsAtISO: "2026-11-15T09:30:00.000Z",
      eventAllDay: false,
      eventType: "personal",
      noteText: null,
      budgetOccasionType: null,
      budgetMinDollars: null,
      budgetMaxDollars: null,
      timeOffStartDate: null,
      timeOffEndDate: null,
      timeOffReason: null,
      timeOffDestination: null,
      ...over,
    }) as never;

  it("create_calendar_event keeps a stay that runs into the next day as ONE event, and saves its location", async () => {
    const { client, calls } = createFakeSupabaseClient({
      calendar_events: { onInsert: (v) => ({ id: "event-2", ...v }) },
    });
    await executeAction(client as never, household, selfPerson, eventAction({ eventLocation: "  12 Oak Lane, Springfield " }));
    const rows = calls.filter((c) => c.table === "calendar_events" && c.op === "insert");
    expect(rows).toHaveLength(1);
    const row = rows[0].values as Record<string, unknown>;
    expect(row.starts_at).toBe("2026-11-14T16:30:00.000Z");
    expect(row.ends_at).toBe("2026-11-15T09:30:00.000Z");
    expect(row.location).toBe("12 Oak Lane, Springfield");
    expect(row.location_lat).toBe(1.5);
    expect(row.location_lng).toBe(2.5);
  });

  it("create_calendar_event leaves location empty when none was given", async () => {
    const { client, calls } = createFakeSupabaseClient({
      calendar_events: { onInsert: (v) => ({ id: "event-3", ...v }) },
    });
    await executeAction(client as never, household, selfPerson, eventAction({}));
    const row = calls.find((c) => c.table === "calendar_events" && c.op === "insert")!.values as Record<string, unknown>;
    expect(row.location).toBeNull();
    expect(row.location_lat).toBeNull();
  });

  it("an all-day event can span several days", async () => {
    const { client, calls } = createFakeSupabaseClient({
      calendar_events: { onInsert: (v) => ({ id: "event-4", ...v }) },
    });
    await executeAction(
      client as never,
      household,
      selfPerson,
      eventAction({ eventTitle: "Lake trip", eventAllDay: true, eventStartsAtISO: "2026-11-13T12:00:00", eventEndsAtISO: "2026-11-15T12:00:00" })
    );
    const row = calls.find((c) => c.table === "calendar_events" && c.op === "insert")!.values as Record<string, unknown>;
    expect(row.starts_at).toBe(new Date("2026-11-13T00:00:00").toISOString());
    expect(row.ends_at).toBe(new Date("2026-11-15T23:59:59").toISOString());
    expect(row.all_day).toBe(true);
  });

  it("record_gift writes a gifts row with status 'idea'", async () => {
    const { client, calls } = createFakeSupabaseClient({
      gifts: { onInsert: (v) => ({ id: "gift-1", ...v }) },
    });

    const result = await executeAction(client as never, household, selfPerson, {
      type: "record_gift",
      personId: "person-2",
      personName: null,
      personRelationshipTypeGuess: null,
      personNotes: null,
      activityType: null,
      activityNotes: null,
      interest: null,
      interestStrength: null,
      interactionType: null,
      interactionNotes: null,
      giftDescription: "Lego set",
      giftOccasionType: "birthday",
      giftOccasionDate: "2026-10-01",
      giftCostDollars: 40,
      eventTitle: null,
      eventStartsAtISO: null,
      eventEndsAtISO: null,
      eventAllDay: null,
      eventType: null,
      noteText: null,
      budgetOccasionType: null,
      budgetMinDollars: null,
      budgetMaxDollars: null,
      timeOffStartDate: null,
      timeOffEndDate: null,
      timeOffReason: null,
      timeOffDestination: null,
    });

    const insertCall = calls.find((c) => c.table === "gifts" && c.op === "insert");
    expect((insertCall!.values as Record<string, unknown>).status).toBe("idea");
    expect((insertCall!.values as Record<string, unknown>).cost_cents).toBe(4000);
    expect(result).toEqual({ table: "gifts", id: "gift-1" });
  });

  it("append_person_note reads the person then updates its notes field", async () => {
    const { client, calls } = createFakeSupabaseClient({
      people: {
        rows: [{ id: "person-2", notes: "Existing note" }],
        onUpdate: (v) => ({ id: "person-2", ...v }),
      },
    });

    const result = await executeAction(client as never, household, selfPerson, {
      type: "append_person_note",
      personId: "person-2",
      personName: null,
      personRelationshipTypeGuess: null,
      personNotes: null,
      activityType: null,
      activityNotes: null,
      interest: null,
      interestStrength: null,
      interactionType: null,
      interactionNotes: null,
      giftDescription: null,
      giftOccasionType: null,
      giftOccasionDate: null,
      giftCostDollars: null,
      eventTitle: null,
      eventStartsAtISO: null,
      eventEndsAtISO: null,
      eventAllDay: null,
      eventType: null,
      noteText: "Shoe size is 10",
      budgetOccasionType: null,
      budgetMinDollars: null,
      budgetMaxDollars: null,
      timeOffStartDate: null,
      timeOffEndDate: null,
      timeOffReason: null,
      timeOffDestination: null,
    });

    const updateCall = calls.find((c) => c.table === "people" && c.op === "update");
    expect((updateCall!.values as Record<string, unknown>).notes).toBe("Existing note\nShoe size is 10");
    expect(result).toEqual({ table: "people", id: "person-2" });
  });

  // D-140: brain-dump gained two new item types that create records
  // rather than only annotate existing ones -- create_person and
  // create_activity. Characterized the same way as the pre-existing
  // cases above.
  it("create_person creates a people row from personName/personRelationshipTypeGuess/personNotes", async () => {
    const { client, calls } = createFakeSupabaseClient({
      people: { onInsert: (v) => ({ id: "person-new", ...v }) },
    });

    const result = await executeAction(client as never, household, selfPerson, {
      type: "create_person",
      personId: null,
      personName: "Sarah",
      personRelationshipTypeGuess: "friend",
      personNotes: "Met at the block party",
      activityType: null,
      activityNotes: null,
      interest: null,
      interestStrength: null,
      interactionType: null,
      interactionNotes: null,
      giftDescription: null,
      giftOccasionType: null,
      giftOccasionDate: null,
      giftCostDollars: null,
      eventTitle: null,
      eventStartsAtISO: null,
      eventEndsAtISO: null,
      eventAllDay: null,
      eventType: null,
      noteText: null,
      budgetOccasionType: null,
      budgetMinDollars: null,
      budgetMaxDollars: null,
      timeOffStartDate: null,
      timeOffEndDate: null,
      timeOffReason: null,
      timeOffDestination: null,
    });

    const insertCall = calls.find((c) => c.table === "people" && c.op === "insert");
    expect((insertCall!.values as Record<string, unknown>).full_name).toBe("Sarah");
    expect((insertCall!.values as Record<string, unknown>).relationship_type).toBe("friend");
    expect((insertCall!.values as Record<string, unknown>).notes).toBe("Met at the block party");
    expect(result).toEqual({ table: "people", id: "person-new" });
  });

  it("create_person throws when personName is missing", async () => {
    const { client } = createFakeSupabaseClient();
    await expect(
      executeAction(client as never, household, selfPerson, {
        type: "create_person",
        personId: null,
        personName: null,
        personRelationshipTypeGuess: null,
        personNotes: null,
        activityType: null,
        activityNotes: null,
        interest: null,
        interestStrength: null,
        interactionType: null,
        interactionNotes: null,
        giftDescription: null,
        giftOccasionType: null,
        giftOccasionDate: null,
        giftCostDollars: null,
        eventTitle: null,
        eventStartsAtISO: null,
        eventEndsAtISO: null,
        eventAllDay: null,
        eventType: null,
        noteText: null,
        budgetOccasionType: null,
        budgetMinDollars: null,
        budgetMaxDollars: null,
        timeOffStartDate: null,
        timeOffEndDate: null,
        timeOffReason: null,
        timeOffDestination: null,
      })
    ).rejects.toThrow("Missing person name");
  });

  it("create_activity creates a user_activities row and folds activityNotes into the target person's notes", async () => {
    const { client, calls } = createFakeSupabaseClient({
      user_activities: { onInsert: (v) => ({ id: "activity-1", ...v }) },
      people: {
        rows: [{ id: "person-2", notes: "Existing note" }],
        onUpdate: (v) => ({ id: "person-2", ...v }),
      },
    });

    const result = await executeAction(client as never, household, selfPerson, {
      type: "create_activity",
      personId: "person-2",
      personName: null,
      personRelationshipTypeGuess: null,
      personNotes: null,
      activityType: "pottery class",
      activityNotes: "Wants to try the Tuesday evening session",
      interest: null,
      interestStrength: null,
      interactionType: null,
      interactionNotes: null,
      giftDescription: null,
      giftOccasionType: null,
      giftOccasionDate: null,
      giftCostDollars: null,
      eventTitle: null,
      eventStartsAtISO: null,
      eventEndsAtISO: null,
      eventAllDay: null,
      eventType: null,
      noteText: null,
      budgetOccasionType: null,
      budgetMinDollars: null,
      budgetMaxDollars: null,
      timeOffStartDate: null,
      timeOffEndDate: null,
      timeOffReason: null,
      timeOffDestination: null,
    });

    const insertCall = calls.find((c) => c.table === "user_activities" && c.op === "insert");
    const insertedValues = insertCall!.values as Record<string, unknown>;
    expect(insertedValues.activity_type).toBe("pottery class");
    expect(insertedValues.person_id).toBe("person-2");
    expect(insertedValues.enjoyment_rank).toBe(5);
    expect(insertedValues.typical_duration_minutes).toBe(60);

    const updateCall = calls.find((c) => c.table === "people" && c.op === "update");
    expect((updateCall!.values as Record<string, unknown>).notes).toBe(
      "Existing note\npottery class: Wants to try the Tuesday evening session"
    );
    expect(result).toEqual({ table: "user_activities", id: "activity-1" });
  });

  it("create_activity defaults personId to the household's self person when unset", async () => {
    const { client, calls } = createFakeSupabaseClient({
      user_activities: { onInsert: (v) => ({ id: "activity-2", ...v }) },
    });

    await executeAction(client as never, household, selfPerson, {
      type: "create_activity",
      personId: null,
      personName: null,
      personRelationshipTypeGuess: null,
      personNotes: null,
      activityType: "morning run",
      activityNotes: null,
      interest: null,
      interestStrength: null,
      interactionType: null,
      interactionNotes: null,
      giftDescription: null,
      giftOccasionType: null,
      giftOccasionDate: null,
      giftCostDollars: null,
      eventTitle: null,
      eventStartsAtISO: null,
      eventEndsAtISO: null,
      eventAllDay: null,
      eventType: null,
      noteText: null,
      budgetOccasionType: null,
      budgetMinDollars: null,
      budgetMaxDollars: null,
      timeOffStartDate: null,
      timeOffEndDate: null,
      timeOffReason: null,
      timeOffDestination: null,
    });

    const insertCall = calls.find((c) => c.table === "user_activities" && c.op === "insert");
    expect((insertCall!.values as Record<string, unknown>).person_id).toBe("person-self");
  });

  it("throws on a required-field action missing its data, exactly as before", async () => {
    const { client } = createFakeSupabaseClient();
    await expect(
      executeAction(client as never, household, selfPerson, {
        type: "record_gift",
        personId: null,
        personName: null,
        personRelationshipTypeGuess: null,
        personNotes: null,
        activityType: null,
        activityNotes: null,
        interest: null,
        interestStrength: null,
        interactionType: null,
        interactionNotes: null,
        giftDescription: null,
        giftOccasionType: null,
        giftOccasionDate: null,
        giftCostDollars: null,
        eventTitle: null,
        eventStartsAtISO: null,
        eventEndsAtISO: null,
        eventAllDay: null,
        eventType: null,
        noteText: null,
        budgetOccasionType: null,
        budgetMinDollars: null,
        budgetMaxDollars: null,
        timeOffStartDate: null,
        timeOffEndDate: null,
        timeOffReason: null,
        timeOffDestination: null,
      })
    ).rejects.toThrow("Missing person or gift description");
  });
});

describe("isKnownPersonId", () => {
  it("unchanged: null personId is always accepted", () => {
    expect(isKnownPersonId([], null)).toBe(true);
  });

  it("unchanged: a personId must match one of the given people", () => {
    const people = [{ id: "a" }] as PersonRow[];
    expect(isKnownPersonId(people, "a")).toBe(true);
    expect(isKnownPersonId(people, "b")).toBe(false);
  });
});
