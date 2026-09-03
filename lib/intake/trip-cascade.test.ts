// R-1 (D-142): pure time-math tests for computeTripCascade and the
// childcare cross-reference. getTravelTime/geocodeAddress are the only
// external calls this module makes, both gated behind `home` being
// non-null -- most cases here pass `home: null` to stay hermetic and
// exercise the "no address on file" degrade path; the geocode/travel-time
// modules have their own tests for the network-adjacent logic itself.
import { describe, expect, it, vi } from "vitest";
import { computeTripCascade, summarizeChildcareCoverage, DEFAULT_TSA_BUFFER_MINUTES } from "./trip-cascade";
import { createFakeSupabaseClient } from "../test-support/fake-supabase";
import type { PersonRow } from "../db/database.types";

vi.mock("../external/geocode", () => ({
  geocodeAddress: vi.fn(async () => ({ status: "ok" as const, result: { lat: 45.5, lng: -122.6, displayName: "PDX" } })),
}));
vi.mock("../external/travel", () => ({
  getTravelTime: vi.fn(async () => ({ minutes: 40, source: "google" as const })),
}));

describe("computeTripCascade", () => {
  it("computes the security cutoff and pack-by time with no home address (no drive-time event)", async () => {
    const departureAt = new Date("2026-09-15T08:00:00.000Z");
    const result = await computeTripCascade({ departureAirport: "PDX", departureAt }, null);

    expect(result.tsaCutoffAt.toISOString()).toBe(
      new Date(departureAt.getTime() - DEFAULT_TSA_BUFFER_MINUTES * 60_000).toISOString()
    );
    expect(result.driveMinutes).toBeNull();
    expect(result.driveTimeSource).toBeNull();
    expect(result.leaveByAt).toBeNull();

    const titles = result.events.map((e) => e.title);
    expect(titles).toContain("Arrive at PDX (security cutoff)");
    expect(titles).toContain("Pack for the trip");
    expect(titles.some((t) => t.startsWith("Leave for"))).toBe(false);

    // Events must come back sorted earliest-first.
    for (let i = 1; i < result.events.length; i++) {
      expect(result.events[i].startsAt.getTime()).toBeGreaterThanOrEqual(result.events[i - 1].startsAt.getTime());
    }
  });

  it("adds a 'leave for the airport' event derived from drive time when a home address is available", async () => {
    const departureAt = new Date("2026-09-15T08:00:00.000Z");
    const result = await computeTripCascade({ departureAirport: "PDX", departureAt }, { lat: 45.4, lng: -122.7 });

    expect(result.driveMinutes).toBe(40);
    expect(result.driveTimeSource).toBe("google");
    expect(result.leaveByAt).not.toBeNull();
    expect(result.leaveByAt!.toISOString()).toBe(new Date(result.tsaCutoffAt.getTime() - 40 * 60_000).toISOString());

    const leaveEvent = result.events.find((e) => e.title.startsWith("Leave for"));
    expect(leaveEvent).toBeTruthy();
    expect(leaveEvent!.confidence).toBeGreaterThan(0.5);
  });

  it("respects a custom TSA buffer and pack-lead override", async () => {
    const departureAt = new Date("2026-09-15T08:00:00.000Z");
    const result = await computeTripCascade(
      { departureAirport: "PDX", departureAt },
      null,
      { tsaBufferMinutes: 90, packLeadMinutes: 60 }
    );

    expect(result.tsaCutoffAt.toISOString()).toBe(new Date(departureAt.getTime() - 90 * 60_000).toISOString());
    expect(result.packByAt.toISOString()).toBe(new Date(result.tsaCutoffAt.getTime() - 60 * 60_000).toISOString());
  });
});

function person(id: string, fullName: string, nickname: string | null = null): PersonRow {
  return {
    id,
    household_id: "household-1",
    user_id: null,
    full_name: fullName,
    nickname,
    relationship_type: "child",
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
  } as PersonRow;
}

describe("summarizeChildcareCoverage", () => {
  it("returns no coverage when there are no accepted requests overlapping the trip window", async () => {
    const { client } = createFakeSupabaseClient({
      childcare_requests: {
        rows: [
          { id: "cc-1", status: "pending", care_date: "2026-09-15", provider_person_id: "p1", child_person_ids: ["c1"] },
        ],
      },
    });

    const result = await summarizeChildcareCoverage(
      client as never,
      "household-1",
      new Date("2026-09-15T08:00:00.000Z"),
      new Date("2026-09-15T11:00:00.000Z"),
      new Map()
    );

    expect(result.hasAcceptedCoverage).toBe(false);
    expect(result.summaries).toHaveLength(0);
  });

  it("summarizes an accepted request overlapping the trip window with provider/child names", async () => {
    const { client } = createFakeSupabaseClient({
      childcare_requests: {
        rows: [
          {
            id: "cc-1",
            status: "accepted",
            care_date: "2026-09-15",
            provider_person_id: "provider-1",
            child_person_ids: ["child-1", "child-2"],
          },
        ],
      },
    });

    const peopleById = new Map([
      ["provider-1", person("provider-1", "Grandma Smith", "Grandma")],
      ["child-1", person("child-1", "Callan Smith", "Cal")],
      ["child-2", person("child-2", "Emlyn Smith", null)],
    ]);

    const result = await summarizeChildcareCoverage(
      client as never,
      "household-1",
      new Date("2026-09-15T08:00:00.000Z"),
      new Date("2026-09-15T11:00:00.000Z"),
      peopleById
    );

    expect(result.hasAcceptedCoverage).toBe(true);
    expect(result.summaries[0]).toContain("Grandma covers Cal & Emlyn Smith");
  });

  it("excludes an accepted request whose care_date falls outside the trip window", async () => {
    const { client } = createFakeSupabaseClient({
      childcare_requests: {
        rows: [
          { id: "cc-1", status: "accepted", care_date: "2026-10-01", provider_person_id: "p1", child_person_ids: ["c1"] },
        ],
      },
    });

    const result = await summarizeChildcareCoverage(
      client as never,
      "household-1",
      new Date("2026-09-15T08:00:00.000Z"),
      new Date("2026-09-15T11:00:00.000Z"),
      new Map()
    );

    expect(result.hasAcceptedCoverage).toBe(false);
  });
});
