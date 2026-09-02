import { describe, expect, it } from "vitest";
import { buildDayTimeline, computeTimelineWindow, DEFAULT_WINDOW_END_HOUR, DEFAULT_WINDOW_START_HOUR } from "./day-timeline";

const DAY = new Date(2026, 8, 2); // Sept 2, 2026 (local)

function at(hour: number, minute = 0): Date {
  return new Date(2026, 8, 2, hour, minute, 0, 0);
}

describe("computeTimelineWindow", () => {
  it("defaults to 7 AM-9 PM when every item is inside that range", () => {
    const window = computeTimelineWindow([{ startsAt: at(9), endsAt: at(10) }]);
    expect(window).toEqual({ startHour: DEFAULT_WINDOW_START_HOUR, endHour: DEFAULT_WINDOW_END_HOUR });
  });

  it("expands the start hour, with one hour of padding, for an early outlier", () => {
    const window = computeTimelineWindow([{ startsAt: at(5, 30), endsAt: at(6) }]);
    // floor(5.5) - 1 = 4
    expect(window.startHour).toBe(4);
    expect(window.endHour).toBe(DEFAULT_WINDOW_END_HOUR);
  });

  it("expands the end hour, with one hour of padding, for a late outlier", () => {
    const window = computeTimelineWindow([{ startsAt: at(22), endsAt: at(23) }]);
    // ceil(23) + 1 = 24, clamped to 24
    expect(window.endHour).toBe(24);
    expect(window.startHour).toBe(DEFAULT_WINDOW_START_HOUR);
  });

  it("clamps to a full 0-24 day and never inverts", () => {
    const window = computeTimelineWindow([{ startsAt: at(0), endsAt: at(23, 59) }]);
    expect(window.startHour).toBe(0);
    expect(window.endHour).toBe(24);
  });
});

describe("buildDayTimeline", () => {
  it("positions a single mid-window event proportionally within the default window", () => {
    const layout = buildDayTimeline(DAY, [
      { id: "evt-1", kind: "event", title: "Lunch", startsAt: at(11), endsAt: at(12) },
    ]);
    expect(layout.startHour).toBe(7);
    expect(layout.endHour).toBe(21);
    // window is 7am-9pm (14h = 840min); 11am is 4h (240min) in => 240/840 = 28.57%
    expect(layout.positioned).toHaveLength(1);
    expect(layout.positioned[0].topPercent).toBeCloseTo((4 / 14) * 100, 1);
    expect(layout.positioned[0].heightPercent).toBeCloseTo((1 / 14) * 100, 1);
  });

  it("separates all-day items into their own bucket instead of positioning them", () => {
    const layout = buildDayTimeline(DAY, [
      { id: "bday-1", kind: "birthday", title: "Sam's Birthday", startsAt: at(0), endsAt: at(0), allDay: true },
      { id: "evt-1", kind: "event", title: "Meeting", startsAt: at(9), endsAt: at(10) },
    ]);
    expect(layout.allDay).toHaveLength(1);
    expect(layout.allDay[0].id).toBe("bday-1");
    expect(layout.positioned).toHaveLength(1);
    expect(layout.positioned[0].id).toBe("evt-1");
  });

  it("gives a zero-duration or very short event a minimum visible height", () => {
    const layout = buildDayTimeline(DAY, [{ id: "evt-1", kind: "event", title: "Ping", startsAt: at(9), endsAt: at(9) }]);
    expect(layout.positioned[0].heightPercent).toBeGreaterThanOrEqual(2);
  });

  it("expands the window to fit an early outlier rather than clipping it off-screen", () => {
    const layout = buildDayTimeline(DAY, [{ id: "evt-1", kind: "event", title: "Early", startsAt: at(3), endsAt: at(8) }]);
    // window expands to fit (floor(3)-1=2 .. 21) -- a 19-hour window -- so
    // the event's 1-hour head start (3am - 2am window start) lands just
    // inside the top of the window, not clipped to a hard 0%.
    expect(layout.startHour).toBe(2);
    expect(layout.positioned[0].topPercent).toBeCloseTo((1 / 19) * 100, 5);
  });

  it("clips an event that started the previous day to the window's top edge, not a negative percent", () => {
    const spillsIn = {
      id: "evt-1",
      kind: "event",
      title: "Started yesterday",
      startsAt: new Date(2026, 8, 1, 22, 0),
      endsAt: at(2),
    };
    const layout = buildDayTimeline(DAY, [spillsIn]);
    expect(layout.positioned[0].topPercent).toBeCloseTo(0, 5);
  });

  it("clips a multi-day event to only the slice that falls on the given day", () => {
    const spansMidnight = { id: "evt-1", kind: "event", title: "Overnight trip", startsAt: at(20), endsAt: new Date(2026, 8, 3, 10, 0) };
    const layout = buildDayTimeline(DAY, [spansMidnight]);
    // window must expand to include 20:00, and the event should be clipped at day end (24:00 local)
    const bottomPercent = layout.positioned[0].topPercent + layout.positioned[0].heightPercent;
    expect(bottomPercent).toBeCloseTo(100, 5);
  });

  it("places a travel segment in the gap between two adjacent positioned events", () => {
    const layout = buildDayTimeline(
      DAY,
      [
        { id: "evt-1", kind: "event", title: "First stop", startsAt: at(9), endsAt: at(10) },
        { id: "evt-2", kind: "event", title: "Second stop", startsAt: at(10, 30), endsAt: at(11) },
      ],
      [{ fromEventId: "evt-1", toEventId: "evt-2", minutes: 20 }]
    );
    expect(layout.travelSegments).toHaveLength(1);
    const segment = layout.travelSegments[0];
    expect(segment.minutes).toBe(20);
    const from = layout.positioned.find((p) => p.id === "evt-1")!;
    const to = layout.positioned.find((p) => p.id === "evt-2")!;
    expect(segment.topPercent).toBeCloseTo(from.topPercent + from.heightPercent, 5);
    expect(segment.topPercent + segment.heightPercent).toBeCloseTo(to.topPercent, 5);
  });

  it("skips a travel leg when the two events touch or overlap (no visible gap)", () => {
    const layout = buildDayTimeline(
      DAY,
      [
        { id: "evt-1", kind: "event", title: "First stop", startsAt: at(9), endsAt: at(10) },
        { id: "evt-2", kind: "event", title: "Second stop", startsAt: at(10), endsAt: at(11) },
      ],
      [{ fromEventId: "evt-1", toEventId: "evt-2", minutes: 15 }]
    );
    expect(layout.travelSegments).toHaveLength(0);
  });

  it("skips a travel leg whose event isn't on this day's timeline", () => {
    const layout = buildDayTimeline(
      DAY,
      [{ id: "evt-2", kind: "event", title: "Only event today", startsAt: at(10), endsAt: at(11) }],
      [{ fromEventId: "evt-missing", toEventId: "evt-2", minutes: 15 }]
    );
    expect(layout.travelSegments).toHaveLength(0);
  });

  it("produces one hour label per hour boundary in the window, inclusive", () => {
    const layout = buildDayTimeline(DAY, [{ id: "evt-1", kind: "event", title: "Meeting", startsAt: at(9), endsAt: at(10) }]);
    expect(layout.hourLabels[0]).toBe("7 AM");
    expect(layout.hourLabels[layout.hourLabels.length - 1]).toBe("9 PM");
    expect(layout.hourLabels).toHaveLength(21 - 7 + 1);
  });
});
