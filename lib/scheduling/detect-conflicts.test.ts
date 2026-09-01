import { describe, expect, it } from "vitest";
import { createFakeSupabaseClient } from "../test-support/fake-supabase";
import { detectScheduleConflictsForHousehold } from "./detect-conflicts";

const HOUSEHOLD_ID = "20000000-0000-0000-0000-000000000001";
const HOME = { lat: 45.5, lng: -122.6 }; // Portland, OR

function baseEvent(overrides: Record<string, unknown>) {
  return {
    id: "evt-1",
    household_id: HOUSEHOLD_ID,
    created_by_person_id: "person-1",
    title: "Untitled",
    description: null,
    all_day: false,
    location: null,
    location_lat: null,
    location_lng: null,
    travel_time_before_minutes: null,
    prep_time_before_minutes: null,
    event_type: "other",
    visibility: "household",
    external_source: null,
    external_id: null,
    related_activity_id: null,
    synced_to_account_id: null,
    external_caldav_href: null,
    external_caldav_etag: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("detectScheduleConflictsForHousehold", () => {
  it("returns no warnings when there is plenty of time between located events", async () => {
    const { client } = createFakeSupabaseClient({
      calendar_events: {
        rows: [
          baseEvent({
            id: "evt-1",
            title: "Client meeting downtown",
            starts_at: "2026-09-02T09:00:00Z",
            ends_at: "2026-09-02T10:00:00Z",
            location_lat: 45.52,
            location_lng: -122.68,
          }),
          baseEvent({
            id: "evt-2",
            title: "Lunch across town",
            starts_at: "2026-09-02T13:00:00Z", // 3 hours later — plenty of drive time
            ends_at: "2026-09-02T14:00:00Z",
            location_lat: 45.48,
            location_lng: -122.5,
          }),
        ],
      },
    });

    const warnings = await detectScheduleConflictsForHousehold(
      client as never,
      HOUSEHOLD_ID,
      "2026-09-02T00:00:00Z",
      "2026-09-03T00:00:00Z",
      HOME
    );

    expect(warnings).toEqual([]);
  });

  it("flags a back-to-back pair that is geographically impossible given drive time", async () => {
    const { client } = createFakeSupabaseClient({
      calendar_events: {
        rows: [
          baseEvent({
            id: "evt-1",
            title: "Meeting in Portland",
            starts_at: "2026-09-02T09:00:00Z",
            ends_at: "2026-09-02T10:00:00Z",
            location_lat: 45.5,
            location_lng: -122.6,
          }),
          baseEvent({
            id: "evt-2",
            title: "Meeting in Salem",
            // Portland -> Salem is roughly 45+ driving minutes; 5 minutes
            // between events is not enough regardless of provider tier.
            starts_at: "2026-09-02T10:05:00Z",
            ends_at: "2026-09-02T11:00:00Z",
            location_lat: 44.94,
            location_lng: -123.03,
          }),
        ],
      },
    });

    const warnings = await detectScheduleConflictsForHousehold(
      client as never,
      HOUSEHOLD_ID,
      "2026-09-02T00:00:00Z",
      "2026-09-03T00:00:00Z",
      HOME
    );

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ fromEventId: "evt-1", toEventId: "evt-2" });
    expect(warnings[0].shortfallMinutes).toBeGreaterThan(0);
    expect(warnings[0].travelTimeSource).toBe("haversine_fallback");
  });

  it("prefers each event's cached travel_time_before_minutes over a fresh lookup", async () => {
    const { client } = createFakeSupabaseClient({
      calendar_events: {
        rows: [
          baseEvent({
            id: "evt-1",
            title: "First stop",
            starts_at: "2026-09-02T09:00:00Z",
            ends_at: "2026-09-02T10:00:00Z",
            location_lat: 45.5,
            location_lng: -122.6,
          }),
          baseEvent({
            id: "evt-2",
            title: "Second stop",
            starts_at: "2026-09-02T10:05:00Z",
            ends_at: "2026-09-02T11:00:00Z",
            location_lat: 45.5001,
            location_lng: -122.6001,
            // Cached value is intentionally huge and unrealistic for this
            // tiny distance, so a warning proves the cache was used instead
            // of a fresh (haversine) lookup that would report ~0 minutes.
            travel_time_before_minutes: 999,
          }),
        ],
      },
    });

    const warnings = await detectScheduleConflictsForHousehold(
      client as never,
      HOUSEHOLD_ID,
      "2026-09-02T00:00:00Z",
      "2026-09-03T00:00:00Z",
      HOME
    );

    expect(warnings).toHaveLength(1);
    expect(warnings[0].travelTimeSource).toBe("cached");
    expect(warnings[0].requiredMinutes).toBe(999);
  });

  it("never mutates anything — no insert/update/upsert/delete call is ever made", async () => {
    const { client, calls } = createFakeSupabaseClient({
      calendar_events: {
        rows: [
          baseEvent({
            id: "evt-1",
            starts_at: "2026-09-02T09:00:00Z",
            ends_at: "2026-09-02T10:00:00Z",
            location_lat: 45.5,
            location_lng: -122.6,
          }),
        ],
      },
    });

    await detectScheduleConflictsForHousehold(
      client as never,
      HOUSEHOLD_ID,
      "2026-09-02T00:00:00Z",
      "2026-09-03T00:00:00Z",
      HOME
    );

    expect(calls.every((c) => c.op === "select")).toBe(true);
  });
});
