import { describe, expect, it } from "vitest";
import { computeMainEventWindow, resolvePrepSlot } from "./accept-plan";

describe("computeMainEventWindow", () => {
  const blockStart = new Date(2026, 8, 5, 9, 0); // Sat 9am
  const blockEnd = new Date(2026, 8, 5, 17, 0); // Sat 5pm

  it("starts at the block start and runs for the activity's typical duration", () => {
    const window = computeMainEventWindow(blockStart, blockEnd, 120);
    expect(window).toEqual({ start: blockStart, end: new Date(2026, 8, 5, 11, 0) });
  });

  it("caps the end at the block end when the activity would run past it", () => {
    const window = computeMainEventWindow(blockStart, blockEnd, 600); // 10 hours, block is only 8
    expect(window).toEqual({ start: blockStart, end: blockEnd });
  });

  it("fits exactly when the duration matches the block length", () => {
    const window = computeMainEventWindow(blockStart, blockEnd, 480);
    expect(window).toEqual({ start: blockStart, end: blockEnd });
  });
});

describe("resolvePrepSlot", () => {
  const prepAt = new Date(2026, 8, 4, 19, 0); // Friday 7pm
  const searchWindowStart = new Date(2026, 8, 4, 4, 0); // Friday 4am
  const searchWindowEnd = new Date(2026, 8, 5, 9, 0); // Saturday 9am (event start)

  it("uses the ideal slot when nothing conflicts", () => {
    const slot = resolvePrepSlot(prepAt, 30, searchWindowStart, searchWindowEnd, []);
    expect(slot).toEqual({ start: prepAt, end: new Date(2026, 8, 4, 19, 30) });
  });

  it("falls back to the nearest open block when the ideal slot conflicts", () => {
    // Something occupies Friday 6:45pm-8pm (a family dinner), overlapping the ideal 7-7:30pm slot.
    const busy = [{ start: new Date(2026, 8, 4, 18, 45), end: new Date(2026, 8, 4, 20, 0) }];
    const slot = resolvePrepSlot(prepAt, 30, searchWindowStart, searchWindowEnd, busy);
    expect(slot).not.toBeNull();
    // The nearest open block to 7pm is the one right after dinner ends at 8pm.
    expect(slot).toEqual({ start: new Date(2026, 8, 4, 20, 0), end: new Date(2026, 8, 4, 20, 30) });
  });

  it("prefers an earlier open block over a later one when both are equidistant-ish, picking strictly nearest", () => {
    // Busy 6pm-9pm blocks out the ideal slot; open before (4am-6pm) and after (9pm-9am next day).
    const busy = [{ start: new Date(2026, 8, 4, 18, 0), end: new Date(2026, 8, 4, 21, 0) }];
    const slot = resolvePrepSlot(prepAt, 30, searchWindowStart, searchWindowEnd, busy);
    // Nearest open block start to 7pm ideal: the pre-dinner block ends at 6pm (distance 1h before)
    // vs the post-dinner block starting at 9pm (distance 2h after) -- pre-dinner's open block starts
    // way earlier (4am) though, so "nearest start" is 9pm (2h away) vs 4am (15h away). Post-dinner wins.
    expect(slot).toEqual({ start: new Date(2026, 8, 4, 21, 0), end: new Date(2026, 8, 4, 21, 30) });
  });

  it("returns null when no block in the search window is long enough", () => {
    // The entire window is densely booked with nothing free for 30 minutes.
    const busy = [{ start: searchWindowStart, end: searchWindowEnd }];
    const slot = resolvePrepSlot(prepAt, 30, searchWindowStart, searchWindowEnd, busy);
    expect(slot).toBeNull();
  });

  it("returns null when the only open block is shorter than the required duration", () => {
    const busy = [
      { start: new Date(2026, 8, 4, 4, 0), end: new Date(2026, 8, 4, 18, 50) },
      { start: new Date(2026, 8, 4, 19, 10), end: new Date(2026, 8, 5, 9, 0) },
    ];
    // Only open block is 18:50-19:10 -- 20 minutes, less than the 30 required.
    const slot = resolvePrepSlot(prepAt, 30, searchWindowStart, searchWindowEnd, busy);
    expect(slot).toBeNull();
  });
});
