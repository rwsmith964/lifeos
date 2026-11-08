import { describe, expect, it } from "vitest";
import { fitActivity, freeWindows, overlapsAny, parseFindTimeIntent, rankWindows } from "./find-time";

const d = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute); // Nov 2026

describe("freeWindows", () => {
  it("returns the gaps between busy blocks within the day's hours", () => {
    const out = freeWindows({
      rangeStart: d(14, 0),
      rangeEnd: d(14, 23),
      busy: [[{ start: d(14, 10), end: d(14, 12) }], [{ start: d(14, 15), end: d(14, 16) }]],
      minMinutes: 120,
      dayStartHour: 7,
      dayEndHour: 20,
    });
    expect(out.map((w) => [w.start.getHours(), w.end.getHours()])).toEqual([
      [7, 10],
      [12, 15],
      [16, 20],
    ]);
    expect(out.every((w) => w.weekend)).toBe(true); // Nov 14 2026 is a Saturday
  });

  it("drops gaps shorter than the activity needs", () => {
    const out = freeWindows({
      rangeStart: d(14, 0),
      rangeEnd: d(14, 23),
      busy: [[{ start: d(14, 8), end: d(14, 19) }]],
      minMinutes: 120,
      dayStartHour: 7,
      dayEndHour: 20,
    });
    expect(out).toEqual([]);
  });

  it("is free for everyone only when nobody is busy (union of all busy time)", () => {
    const mine = [{ start: d(14, 7), end: d(14, 13) }];
    const theirs = [{ start: d(14, 12), end: d(14, 15) }];
    const out = freeWindows({ rangeStart: d(14, 0), rangeEnd: d(14, 23), busy: [mine, theirs], minMinutes: 60, dayStartHour: 7, dayEndHour: 20 });
    expect(out).toHaveLength(1);
    expect(out[0].start).toEqual(d(14, 15));
  });

  it("starts no earlier than the range start (don't suggest the past)", () => {
    const out = freeWindows({ rangeStart: d(14, 14), rangeEnd: d(14, 23), busy: [[]], minMinutes: 60, dayStartHour: 7, dayEndHour: 20 });
    expect(out[0].start).toEqual(d(14, 14));
  });
});

describe("rankWindows", () => {
  it("prefers weekends, then longer windows, at most two per day, in date order", () => {
    const wk = freeWindows({ rangeStart: d(9, 0), rangeEnd: d(15, 23), busy: [[]], minMinutes: 120, dayStartHour: 7, dayEndHour: 20 });
    const picked = rankWindows(wk, 3);
    expect(picked).toHaveLength(3);
    expect(picked.filter((w) => w.weekend)).toHaveLength(2); // Sat and Sun are chosen before any weekday
    expect(picked[0].start <= picked[1].start).toBe(true);
  });
});

describe("helpers", () => {
  it("fits the activity to the start of a long window", () => {
    const [w] = freeWindows({ rangeStart: d(14, 0), rangeEnd: d(14, 23), busy: [[]], minMinutes: 60, dayStartHour: 7, dayEndHour: 20 });
    const fit = fitActivity(w, 240);
    expect(fit.start).toEqual(d(14, 7));
    expect(fit.end).toEqual(d(14, 11));
  });
  it("detects overlap with custody blocks", () => {
    expect(overlapsAny({ start: d(14, 9), end: d(14, 12) }, [{ start: d(14, 11), end: d(14, 18) }])).toBe(true);
    expect(overlapsAny({ start: d(14, 9), end: d(14, 11) }, [{ start: d(14, 11), end: d(14, 18) }])).toBe(false);
  });
});

describe("parseFindTimeIntent", () => {
  it("parses the example phrasing", () => {
    expect(parseFindTimeIntent("find a time for Rusty and I to go fishing")).toEqual({ withName: "Rusty", activity: "fishing" });
  });
  it("handles me and punctuation", () => {
    expect(parseFindTimeIntent("Find a time for Rusty and me to play golf?")).toEqual({ withName: "Rusty", activity: "play golf" });
  });
  it("ignores ordinary notes", () => {
    expect(parseFindTimeIntent("Cal's shoe size is 10")).toBeNull();
    expect(parseFindTimeIntent("remind me to call Rusty")).toBeNull();
  });
});
