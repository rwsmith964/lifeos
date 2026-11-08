import { describe, expect, it } from "vitest";
import { detectPlatform, navigationLinks, planReminders, stableNotificationId, type DepartureEvent } from "./departures";

const event = (over: Partial<DepartureEvent> & { id: string }): DepartureEvent => ({
  startLocal: "2026-11-14T12:00:00",
  title: "Drive to Defy",
  destinationName: "Defy",
  lat: 45.5,
  lng: -122.6,
  ...over,
});

const NOW = new Date(2026, 10, 14, 10, 0);

describe("planReminders", () => {
  it("schedules a heads-up 15 minutes before and a depart reminder at the start", () => {
    const out = planReminders([event({ id: "a" })], NOW);
    expect(out.map((r) => r.kind)).toEqual(["heads_up", "depart"]);
    expect(out[0].fireAt).toEqual(new Date(2026, 10, 14, 11, 45));
    expect(out[1].fireAt).toEqual(new Date(2026, 10, 14, 12, 0));
    expect(out[0].title).toBe("Leave in 15 minutes");
    expect(out[1].body).toContain("Defy");
  });

  it("skips a heads-up that is already past but keeps the depart reminder", () => {
    const out = planReminders([event({ id: "a", startLocal: "2026-11-14T10:10:00" })], NOW);
    expect(out.map((r) => r.kind)).toEqual(["depart"]);
  });

  it("skips drives that have already started or are beyond the horizon", () => {
    expect(planReminders([event({ id: "a", startLocal: "2026-11-14T09:00:00" })], NOW)).toEqual([]);
    expect(planReminders([event({ id: "b", startLocal: "2026-11-20T09:00:00" })], NOW)).toEqual([]);
  });

  it("orders reminders by time and gives each a stable, distinct id", () => {
    const out = planReminders([event({ id: "late", startLocal: "2026-11-14T15:00:00" }), event({ id: "early", startLocal: "2026-11-14T11:00:00" })], NOW);
    expect(out.map((r) => r.eventId)).toEqual(["early", "early", "late", "late"]);
    expect(new Set(out.map((r) => r.notificationId)).size).toBe(4);
    expect(stableNotificationId("early", "depart")).toBe(stableNotificationId("early", "depart"));
    expect(stableNotificationId("early", "depart")).toBeGreaterThanOrEqual(0);
  });
});

describe("navigation links", () => {
  const dest = { lat: 45.5, lng: -122.6, label: "Dad's house" };
  it("uses Apple Maps on iOS and a geo: link on Android", () => {
    expect(navigationLinks(dest, "ios").native).toContain("maps.apple.com");
    expect(navigationLinks(dest, "android").native).toMatch(/^geo:0,0\?q=45\.5,-122\.6/);
    expect(navigationLinks(dest, "other").native).toContain("google.com/maps");
  });
  it("always offers Google Maps and Waze too", () => {
    const links = navigationLinks(dest, "ios");
    expect(links.google).toContain("destination=45.5,-122.6");
    expect(links.waze).toContain("ll=45.5,-122.6");
  });
  it("detects the platform from the user agent", () => {
    expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 14)")).toBe("android");
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0)")).toBe("other");
  });
});
