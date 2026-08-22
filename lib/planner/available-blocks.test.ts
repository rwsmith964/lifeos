import { describe, expect, it } from "vitest";
import { findOpenBlocks, largestOpenBlock } from "./available-blocks";

const DAY_START = new Date(2026, 7, 22, 8, 0); // Sat 8am
const DAY_END = new Date(2026, 7, 22, 20, 0); // Sat 8pm

describe("findOpenBlocks", () => {
  it("returns the whole window as one block when there's nothing busy", () => {
    const blocks = findOpenBlocks(DAY_START, DAY_END, []);
    expect(blocks).toEqual([{ start: DAY_START, end: DAY_END, durationMinutes: 720 }]);
  });

  it("splits around a single busy period in the middle", () => {
    const busy = { start: new Date(2026, 7, 22, 12, 0), end: new Date(2026, 7, 22, 13, 0) };
    const blocks = findOpenBlocks(DAY_START, DAY_END, [busy]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ start: DAY_START, end: busy.start, durationMinutes: 240 });
    expect(blocks[1]).toEqual({ start: busy.end, end: DAY_END, durationMinutes: 420 });
  });

  it("handles a busy period that starts before the window", () => {
    const busy = { start: new Date(2026, 7, 22, 6, 0), end: new Date(2026, 7, 22, 9, 0) };
    const blocks = findOpenBlocks(DAY_START, DAY_END, [busy]);
    expect(blocks).toEqual([{ start: busy.end, end: DAY_END, durationMinutes: 660 }]);
  });

  it("handles a busy period that extends past the window", () => {
    const busy = { start: new Date(2026, 7, 22, 18, 0), end: new Date(2026, 7, 22, 23, 0) };
    const blocks = findOpenBlocks(DAY_START, DAY_END, [busy]);
    expect(blocks).toEqual([{ start: DAY_START, end: busy.start, durationMinutes: 600 }]);
  });

  it("returns no blocks when the whole window is busy", () => {
    const busy = { start: DAY_START, end: DAY_END };
    expect(findOpenBlocks(DAY_START, DAY_END, [busy])).toEqual([]);
  });

  it("merges overlapping busy periods correctly (no negative-duration blocks)", () => {
    const busyA = { start: new Date(2026, 7, 22, 10, 0), end: new Date(2026, 7, 22, 14, 0) };
    const busyB = { start: new Date(2026, 7, 22, 12, 0), end: new Date(2026, 7, 22, 16, 0) };
    const blocks = findOpenBlocks(DAY_START, DAY_END, [busyA, busyB]);
    expect(blocks).toEqual([
      { start: DAY_START, end: busyA.start, durationMinutes: 120 },
      { start: busyB.end, end: DAY_END, durationMinutes: 240 },
    ]);
  });

  it("ignores busy periods entirely outside the window", () => {
    const busy = { start: new Date(2026, 7, 21, 8, 0), end: new Date(2026, 7, 21, 9, 0) }; // day before
    const blocks = findOpenBlocks(DAY_START, DAY_END, [busy]);
    expect(blocks).toEqual([{ start: DAY_START, end: DAY_END, durationMinutes: 720 }]);
  });
});

describe("largestOpenBlock", () => {
  it("returns null for an empty list", () => {
    expect(largestOpenBlock([])).toBeNull();
  });

  it("picks the longest block", () => {
    const blocks = findOpenBlocks(DAY_START, DAY_END, [
      { start: new Date(2026, 7, 22, 12, 0), end: new Date(2026, 7, 22, 13, 0) },
    ]);
    const largest = largestOpenBlock(blocks);
    expect(largest?.durationMinutes).toBe(420); // the afternoon block, not the morning
  });
});
