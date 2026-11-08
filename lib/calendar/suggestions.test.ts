import { describe, expect, it } from "vitest";
import {
  buildSuggestionLegs,
  buildSuggestions,
  suggestionKey,
  SUGGESTION_SOURCE,
  type SuggestionEvent,
} from "./suggestions";

const NOW = new Date(2026, 10, 9, 8, 0); // Mon Nov 9, 8:00

function ev(over: Partial<SuggestionEvent> & { id: string }): SuggestionEvent {
  return {
    title: "Cal's game",
    startsAt: new Date(2026, 10, 9, 17, 0),
    endsAt: new Date(2026, 10, 9, 18, 30),
    allDay: false,
    eventType: "personal",
    prepMinutes: null,
    externalSource: null,
    ...over,
  };
}

const none = new Set<string>();

describe("buildSuggestions: travel", () => {
  it("suggests leaving drive time plus a door buffer before the event", () => {
    const [s] = buildSuggestions({ events: [ev({ id: "a" })], travelMinutesByEventId: new Map([["a", 25]]), skipKeys: none, now: NOW });
    expect(s.kind).toBe("travel");
    expect(s.startsAt).toEqual(new Date(2026, 10, 9, 16, 30));
    expect(s.endsAt).toEqual(new Date(2026, 10, 9, 17, 0));
    expect(s.detail).toContain("Leave by 4:30 PM");
    expect(s.tight).toBe(false);
  });

  it("skips short drives", () => {
    expect(buildSuggestions({ events: [ev({ id: "a" })], travelMinutesByEventId: new Map([["a", 6]]), skipKeys: none, now: NOW })).toEqual([]);
  });

  it("flags when you'd have to leave before something earlier finishes", () => {
    const earlier = ev({ id: "w", title: "Dentist", startsAt: new Date(2026, 10, 9, 15, 30), endsAt: new Date(2026, 10, 9, 16, 45) });
    const out = buildSuggestions({
      events: [earlier, ev({ id: "a" })],
      travelMinutesByEventId: new Map([["a", 25]]),
      skipKeys: none,
      now: NOW,
    });
    const travel = out.find((s) => s.eventId === "a")!;
    expect(travel.tight).toBe(true);
    expect(travel.detail).toContain("Dentist");
  });

  it("respects dismissed or accepted keys", () => {
    const out = buildSuggestions({
      events: [ev({ id: "a" })],
      travelMinutesByEventId: new Map([["a", 25]]),
      skipKeys: new Set([suggestionKey("travel", "a")]),
      now: NOW,
    });
    expect(out).toEqual([]);
  });

  it("ignores all-day, past, travel-type and already-suggested events", () => {
    const out = buildSuggestions({
      events: [
        ev({ id: "1", allDay: true }),
        ev({ id: "2", startsAt: new Date(2026, 10, 9, 7, 0), endsAt: new Date(2026, 10, 9, 7, 30) }),
        ev({ id: "3", eventType: "travel" }),
        ev({ id: "4", externalSource: SUGGESTION_SOURCE }),
      ],
      travelMinutesByEventId: new Map([["1", 30], ["2", 30], ["3", 30], ["4", 30]]),
      skipKeys: none,
      now: NOW,
    });
    expect(out).toEqual([]);
  });
});

describe("buildSuggestions: prep", () => {
  it("uses the prep time set on the event and ends it when you'd leave", () => {
    const out = buildSuggestions({
      events: [ev({ id: "a", prepMinutes: 30 })],
      travelMinutesByEventId: new Map([["a", 25]]),
      skipKeys: none,
      now: NOW,
    });
    const prep = out.find((s) => s.kind === "prep")!;
    expect(prep.title).toBe("Get ready for Cal's game");
    expect(prep.endsAt).toEqual(new Date(2026, 10, 9, 16, 30));
    expect(prep.startsAt).toEqual(new Date(2026, 10, 9, 16, 0));
    expect(out.map((s) => s.kind)).toEqual(["prep", "travel"]);
  });

  it("ends prep at the event start when there's no drive to plan for", () => {
    const [prep] = buildSuggestions({ events: [ev({ id: "a", prepMinutes: 15 })], travelMinutesByEventId: new Map(), skipKeys: none, now: NOW });
    expect(prep.endsAt).toEqual(new Date(2026, 10, 9, 17, 0));
  });

  it("offers gear packing for a kid's activity with no prep time set", () => {
    const [prep] = buildSuggestions({ events: [ev({ id: "a", eventType: "kid_activity", title: "Soccer" })], travelMinutesByEventId: new Map(), skipKeys: none, now: NOW });
    expect(prep.title).toBe("Pack gear for Soccer");
    expect(prep.minutes).toBe(20);
  });

  it("offers nothing for an ordinary event with no prep time", () => {
    expect(buildSuggestions({ events: [ev({ id: "a" })], travelMinutesByEventId: new Map(), skipKeys: none, now: NOW })).toEqual([]);
  });
});

describe("buildSuggestionLegs", () => {
  const home = { lat: 1, lng: 1 };
  const e = (id: string, day: number, hour: number, lat: number | null, lng: number | null) => ({
    id,
    startsAt: new Date(2026, 10, day, hour, 0),
    lat,
    lng,
  });

  it("starts the first stop of the day from home and chains later stops", () => {
    const legs = buildSuggestionLegs([e("a", 9, 9, 2, 2), e("b", 9, 12, 3, 3)], home);
    expect(legs).toEqual([
      { eventId: "a", from: home, to: { lat: 2, lng: 2 } },
      { eventId: "b", from: { lat: 2, lng: 2 }, to: { lat: 3, lng: 3 } },
    ]);
  });

  it("starts each day from home rather than yesterday's last stop", () => {
    const legs = buildSuggestionLegs([e("a", 9, 18, 2, 2), e("b", 10, 9, 3, 3)], home);
    expect(legs[1].from).toEqual(home);
  });

  it("skips events with no coordinates and gives the first stop no leg without a home", () => {
    expect(buildSuggestionLegs([e("a", 9, 9, null, null)], home)).toEqual([]);
    const legs = buildSuggestionLegs([e("a", 9, 9, 2, 2), e("b", 9, 12, 3, 3)], null);
    expect(legs.map((l) => l.eventId)).toEqual(["b"]);
  });
});

describe("buildSuggestions: errands from the invitee's note", () => {
  const dinner = (over: Partial<SuggestionEvent> = {}) =>
    ev({
      id: "d",
      title: "Thanksgiving at Rusty's",
      startsAt: new Date(2026, 10, 26, 15, 0),
      endsAt: new Date(2026, 10, 26, 19, 0),
      description: "Hosted by Rusty\nYour note: Bake a pecan pie and bring ice",
      ...over,
    });

  it("suggests shopping and cooking the evening before", () => {
    const out = buildSuggestions({ events: [dinner()], travelMinutesByEventId: new Map(), skipKeys: none, now: NOW });
    const titles = out.map((s) => s.title);
    expect(titles).toContain("Shop for pecan pie");
    expect(titles).toContain("Make pecan pie");
    expect(titles).toContain("Shop for ice");
    expect(titles).not.toContain("Make ice");
    const shop = out.find((s) => s.title === "Shop for pecan pie")!;
    expect(shop.kind).toBe("errand");
    expect(shop.startsAt).toEqual(new Date(2026, 10, 25, 17, 0));
    expect(out.find((s) => s.title === "Make pecan pie")!.startsAt).toEqual(new Date(2026, 10, 25, 18, 0));
  });

  it("skips dismissed errands individually", () => {
    const key = suggestionKey("errand", "d:0:cook");
    const out = buildSuggestions({ events: [dinner()], travelMinutesByEventId: new Map(), skipKeys: new Set([key]), now: NOW });
    expect(out.map((s) => s.title)).not.toContain("Make pecan pie");
    expect(out.map((s) => s.title)).toContain("Shop for pecan pie");
  });

  it("makes no errands when there is no note", () => {
    const out = buildSuggestions({ events: [dinner({ description: "Hosted by Rusty" })], travelMinutesByEventId: new Map(), skipKeys: none, now: NOW });
    expect(out).toEqual([]);
  });

  it("fits errands in before the event when the evening before has already passed", () => {
    const soon = dinner({ startsAt: new Date(2026, 10, 9, 19, 0), endsAt: new Date(2026, 10, 9, 21, 0) });
    const out = buildSuggestions({ events: [soon], travelMinutesByEventId: new Map(), skipKeys: none, now: NOW });
    const shop = out.find((s) => s.title === "Shop for pecan pie")!;
    expect(shop.startsAt > NOW).toBe(true);
    expect(shop.endsAt <= new Date(2026, 10, 9, 18, 30)).toBe(true);
  });
});

describe("buildSuggestions: drive blocks already on the calendar", () => {
  it("doesn't suggest leaving when a drive block already ends at the event's start", () => {
    const drive = ev({ id: "drive", title: "Drive to Cal's game", eventType: "travel", startsAt: new Date(2026, 10, 9, 16, 30), endsAt: new Date(2026, 10, 9, 17, 0) });
    const out = buildSuggestions({ events: [drive, ev({ id: "a" })], travelMinutesByEventId: new Map([["a", 25]]), skipKeys: none, now: NOW });
    expect(out).toEqual([]);
  });
});
