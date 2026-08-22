import { describe, expect, it } from "vitest";
import { computePrepObligations, computeTravelLegs, type ActivityForPrep } from "./prep";

const HOME = { lat: 44.0521, lng: -123.0868 };

describe("computeTravelLegs", () => {
  it("measures the first located event of the day from home", () => {
    const legs = computeTravelLegs(
      [{ id: "e1", startsAt: new Date(2026, 7, 22, 9, 0), locationLat: 43.9, locationLng: -122.8 }],
      HOME
    );
    expect(legs).toEqual([{ eventId: "e1", from: HOME, to: { lat: 43.9, lng: -122.8 } }]);
  });

  it("measures a later event from the PREVIOUS event's location, not home", () => {
    const golf = { lat: 43.9165, lng: -123.0234 };
    const fishing = { lat: 43.8965, lng: -122.8195 };
    const legs = computeTravelLegs(
      [
        { id: "golf", startsAt: new Date(2026, 7, 22, 9, 0), locationLat: golf.lat, locationLng: golf.lng },
        { id: "fishing", startsAt: new Date(2026, 7, 22, 14, 0), locationLat: fishing.lat, locationLng: fishing.lng },
      ],
      HOME
    );
    expect(legs).toHaveLength(2);
    expect(legs[0]).toEqual({ eventId: "golf", from: HOME, to: golf });
    expect(legs[1]).toEqual({ eventId: "fishing", from: golf, to: fishing });
  });

  it("sorts by start time regardless of input order", () => {
    const a = { id: "later", startsAt: new Date(2026, 7, 22, 14, 0), locationLat: 1, locationLng: 1 };
    const b = { id: "earlier", startsAt: new Date(2026, 7, 22, 9, 0), locationLat: 2, locationLng: 2 };
    const legs = computeTravelLegs([a, b], HOME);
    expect(legs.map((l) => l.eventId)).toEqual(["earlier", "later"]);
  });

  it("skips events with no location entirely", () => {
    const legs = computeTravelLegs(
      [{ id: "e1", startsAt: new Date(2026, 7, 22, 9, 0), locationLat: null, locationLng: null }],
      HOME
    );
    expect(legs).toEqual([]);
  });

  it("a location-less event in the middle doesn't reset 'previous location' to home", () => {
    const golf = { lat: 43.9165, lng: -123.0234 };
    const fishing = { lat: 43.8965, lng: -122.8195 };
    const legs = computeTravelLegs(
      [
        { id: "golf", startsAt: new Date(2026, 7, 22, 9, 0), locationLat: golf.lat, locationLng: golf.lng },
        { id: "call", startsAt: new Date(2026, 7, 22, 12, 0), locationLat: null, locationLng: null },
        { id: "fishing", startsAt: new Date(2026, 7, 22, 14, 0), locationLat: fishing.lat, locationLng: fishing.lng },
      ],
      HOME
    );
    expect(legs.find((l) => l.eventId === "fishing")?.from).toEqual(golf);
  });
});

describe("computePrepObligations", () => {
  const fishingActivity: ActivityForPrep = { id: "act-fishing", requiresPrep: true, prepLeadTimeHours: 12 };
  const golfActivity: ActivityForPrep = { id: "act-golf", requiresPrep: false, prepLeadTimeHours: null };
  const activitiesById = new Map([
    ["act-fishing", fishingActivity],
    ["act-golf", golfActivity],
  ]);

  it("generates a prep obligation for an event linked to a prep-requiring activity", () => {
    const saturdayFishing = new Date(2026, 7, 22, 6, 30); // Sat 6:30am
    const obligations = computePrepObligations(
      [{ id: "e1", startsAt: saturdayFishing, relatedActivityId: "act-fishing" }],
      activitiesById
    );
    expect(obligations).toHaveLength(1);
    // 12 hours before 6:30am Saturday = 6:30pm Friday
    expect(obligations[0].prepAt).toEqual(new Date(2026, 7, 21, 18, 30));
  });

  it("does not generate an obligation for an activity that doesn't require prep", () => {
    const obligations = computePrepObligations(
      [{ id: "e1", startsAt: new Date(2026, 7, 22, 8, 0), relatedActivityId: "act-golf" }],
      activitiesById
    );
    expect(obligations).toEqual([]);
  });

  it("does not generate an obligation for an event with no linked activity", () => {
    const obligations = computePrepObligations(
      [{ id: "e1", startsAt: new Date(2026, 7, 22, 8, 0), relatedActivityId: null }],
      activitiesById
    );
    expect(obligations).toEqual([]);
  });

  it("does not generate an obligation for an unknown activity id", () => {
    const obligations = computePrepObligations(
      [{ id: "e1", startsAt: new Date(2026, 7, 22, 8, 0), relatedActivityId: "does-not-exist" }],
      activitiesById
    );
    expect(obligations).toEqual([]);
  });
});
