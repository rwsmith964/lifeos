import { describe, expect, it } from "vitest";
import { detectTravelTimeConflicts, type LocatedTimedEvent, type TravelMinutesLookup } from "./travel-conflicts";

function event(
  id: string,
  title: string,
  startsAt: string,
  endsAt: string,
  lat: number | null = 45.5,
  lng: number | null = -122.6
): LocatedTimedEvent {
  return { id, title, startsAt: new Date(startsAt), endsAt: new Date(endsAt), locationLat: lat, locationLng: lng };
}

function lookup(eventId: string, minutes: number, source: TravelMinutesLookup["source"] = "haversine_fallback") {
  return [eventId, { leg: { eventId, from: { lat: 0, lng: 0 }, to: { lat: 0, lng: 0 } }, minutes, source }] as const;
}

describe("detectTravelTimeConflicts", () => {
  it("flags a leg where the gap is smaller than the required drive time", () => {
    const events = [
      event("a", "Soccer practice", "2026-09-01T09:00:00Z", "2026-09-01T10:00:00Z"),
      event("b", "Dentist", "2026-09-01T10:15:00Z", "2026-09-01T11:00:00Z"),
    ];
    // Only 15 minutes available, but the drive takes 30.
    const travelMinutesByEventId = new Map([lookup("b", 30)]);

    const warnings = detectTravelTimeConflicts(events, travelMinutesByEventId);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      fromEventId: "a",
      toEventId: "b",
      availableMinutes: 15,
      requiredMinutes: 30,
      shortfallMinutes: 15,
    });
  });

  it("does not flag a leg with enough travel buffer", () => {
    const events = [
      event("a", "Soccer practice", "2026-09-01T09:00:00Z", "2026-09-01T10:00:00Z"),
      event("b", "Dentist", "2026-09-01T11:00:00Z", "2026-09-01T11:45:00Z"),
    ];
    const travelMinutesByEventId = new Map([lookup("b", 30)]);

    expect(detectTravelTimeConflicts(events, travelMinutesByEventId)).toEqual([]);
  });

  it("flags a literal overlap as a conflict with a negative available window", () => {
    const events = [
      event("a", "Call with client", "2026-09-01T09:00:00Z", "2026-09-01T10:00:00Z"),
      event("b", "School pickup", "2026-09-01T09:45:00Z", "2026-09-01T10:15:00Z"),
    ];
    const travelMinutesByEventId = new Map([lookup("b", 20)]);

    const warnings = detectTravelTimeConflicts(events, travelMinutesByEventId);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].availableMinutes).toBe(-15);
  });

  it("skips events with no location — nothing to travel to", () => {
    const events = [
      event("a", "Video call", "2026-09-01T09:00:00Z", "2026-09-01T10:00:00Z", null, null),
      event("b", "Dentist", "2026-09-01T10:05:00Z", "2026-09-01T10:30:00Z"),
    ];
    const travelMinutesByEventId = new Map([lookup("b", 30)]);

    expect(detectTravelTimeConflicts(events, travelMinutesByEventId)).toEqual([]);
  });

  it("skips a leg with no resolved travel-minutes lookup", () => {
    const events = [
      event("a", "Soccer practice", "2026-09-01T09:00:00Z", "2026-09-01T10:00:00Z"),
      event("b", "Dentist", "2026-09-01T10:05:00Z", "2026-09-01T10:30:00Z"),
    ];
    expect(detectTravelTimeConflicts(events, new Map())).toEqual([]);
  });

  it("sorts unordered input chronologically before comparing adjacent legs", () => {
    const events = [
      event("b", "Dentist", "2026-09-01T10:15:00Z", "2026-09-01T11:00:00Z"),
      event("a", "Soccer practice", "2026-09-01T09:00:00Z", "2026-09-01T10:00:00Z"),
    ];
    const travelMinutesByEventId = new Map([lookup("b", 30)]);

    const warnings = detectTravelTimeConflicts(events, travelMinutesByEventId);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].fromEventId).toBe("a");
    expect(warnings[0].toEventId).toBe("b");
  });

  it("never mutates the input events array", () => {
    const events = [
      event("a", "Soccer practice", "2026-09-01T09:00:00Z", "2026-09-01T10:00:00Z"),
      event("b", "Dentist", "2026-09-01T10:15:00Z", "2026-09-01T11:00:00Z"),
    ];
    const snapshot = JSON.parse(JSON.stringify(events));
    detectTravelTimeConflicts(events, new Map([lookup("b", 30)]));
    expect(JSON.parse(JSON.stringify(events))).toEqual(snapshot);
  });
});
