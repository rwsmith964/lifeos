import { describe, expect, it } from "vitest";
import {
  busyDayIsCoveredByEvent,
  isSameOccurrence,
  reconcileDuplicateEvents,
  titlesLookSame,
  type ReconcilableEvent,
} from "./reconcile";

function ev(over: Partial<ReconcilableEvent> & { id: string }): ReconcilableEvent {
  return {
    title: "Dinner at Luigi's",
    starts_at: "2026-11-14T18:00:00.000Z",
    ends_at: "2026-11-14T20:00:00.000Z",
    all_day: false,
    location: null,
    description: null,
    external_source: null,
    ...over,
  };
}

describe("titlesLookSame", () => {
  it("matches the same words in a different order or punctuation", () => {
    expect(titlesLookSame("Emma's Wedding", "Wedding - Emma")).toBe(true);
  });
  it("matches when one title is the other plus a word", () => {
    expect(titlesLookSame("Soccer practice", "Soccer")).toBe(true);
  });
  it("does not match unrelated titles", () => {
    expect(titlesLookSame("Dentist", "Soccer practice")).toBe(false);
  });
  it("does not match on a tiny shared fragment", () => {
    expect(titlesLookSame("A", "A b c d")).toBe(false);
  });
});

describe("isSameOccurrence", () => {
  it("allows a few minutes of drift between copies", () => {
    expect(isSameOccurrence(ev({ id: "a" }), ev({ id: "b", starts_at: "2026-11-14T18:10:00.000Z" }))).toBe(true);
  });
  it("rejects a different start time", () => {
    expect(isSameOccurrence(ev({ id: "a" }), ev({ id: "b", starts_at: "2026-11-14T19:00:00.000Z" }))).toBe(false);
  });
  it("never merges an all-day event with a timed one", () => {
    expect(isSameOccurrence(ev({ id: "a" }), ev({ id: "b", all_day: true }))).toBe(false);
  });
});

describe("reconcileDuplicateEvents", () => {
  it("folds a feed copy into the one entered by hand and keeps the better location", () => {
    const manual = ev({ id: "manual" });
    const feed = ev({ id: "feed", external_source: "ics:brittney", location: "Luigi's, 12 Main St" });
    const { events, hiddenDuplicates } = reconcileDuplicateEvents([manual, feed]);
    expect(hiddenDuplicates).toBe(1);
    expect(events).toHaveLength(1);
    expect(events[0].location).toBe("Luigi's, 12 Main St");
  });

  it("keeps the more detailed copy when both are imported", () => {
    const sparse = ev({ id: "x", external_source: "ics:a" });
    const rich = ev({ id: "y", external_source: "ics:b", location: "Here", description: "Details" });
    const { events } = reconcileDuplicateEvents([sparse, rich]);
    expect(events.map((e) => e.id)).toEqual(["y"]);
  });

  it("leaves distinct events alone and keeps order", () => {
    const a = ev({ id: "a" });
    const b = ev({ id: "b", title: "Dentist", starts_at: "2026-11-14T09:00:00.000Z" });
    const { events, hiddenDuplicates } = reconcileDuplicateEvents([a, b]);
    expect(hiddenDuplicates).toBe(0);
    expect(events.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("collapses three copies into one", () => {
    const { events, hiddenDuplicates } = reconcileDuplicateEvents([ev({ id: "1" }), ev({ id: "2" }), ev({ id: "3" })]);
    expect(events).toHaveLength(1);
    expect(hiddenDuplicates).toBe(2);
  });
});

describe("busyDayIsCoveredByEvent", () => {
  const busy = { personName: "Brittney", label: "Kids' weeks", date: "2026-11-10" };

  it("is covered by a multi-day all-day event that names her and the kids", () => {
    const e = ev({ id: "k", title: "Brittney - kids week", all_day: true, starts_at: "2026-11-09T00:00:00.000Z", ends_at: "2026-11-15T23:59:59.000Z" });
    expect(busyDayIsCoveredByEvent(busy, [e])).toBe(true);
  });

  it("is covered when the event repeats the schedule's own label", () => {
    const e = ev({ id: "k", title: "Kids' weeks", all_day: true, starts_at: "2026-11-10T00:00:00.000Z", ends_at: "2026-11-10T23:59:59.000Z" });
    expect(busyDayIsCoveredByEvent(busy, [e])).toBe(true);
  });

  it("is not covered by an unrelated all-day event or a timed one", () => {
    const holiday = ev({ id: "h", title: "Veterans Day", all_day: true, starts_at: "2026-11-10T00:00:00.000Z", ends_at: "2026-11-10T23:59:59.000Z" });
    const timed = ev({ id: "t", title: "Brittney kids week", starts_at: "2026-11-10T18:00:00.000Z" });
    expect(busyDayIsCoveredByEvent(busy, [holiday, timed])).toBe(false);
  });

  it("is not covered on a day outside the event", () => {
    const e = ev({ id: "k", title: "Brittney kids week", all_day: true, starts_at: "2026-11-02T00:00:00.000Z", ends_at: "2026-11-08T23:59:59.000Z" });
    expect(busyDayIsCoveredByEvent(busy, [e])).toBe(false);
  });
});
