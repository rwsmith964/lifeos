import { describe, expect, it } from "vitest";
import { filterActualCustodyTransitions } from "./custody-transitions";

describe("filterActualCustodyTransitions", () => {
  const windowStart = new Date("2026-09-05T00:00:00.000Z"); // Saturday
  const windowEnd = new Date("2026-09-07T00:00:00.000Z"); // today+2 (Sat, Sun)

  it("drops a multi-day block that started before the window (no transition today/tomorrow)", () => {
    // Fri 4:30pm -> Mon 8:30am, still overlaps Sat/Sun, but no handover in [Sat,Mon).
    const blocks = [{ starts_at: "2026-09-04T16:30:00.000Z" }];
    expect(filterActualCustodyTransitions(blocks, windowStart, windowEnd)).toEqual([]);
  });

  it("keeps a block whose handover starts today", () => {
    const blocks = [{ starts_at: "2026-09-05T08:30:00.000Z" }];
    expect(filterActualCustodyTransitions(blocks, windowStart, windowEnd)).toHaveLength(1);
  });

  it("keeps a block whose handover starts tomorrow", () => {
    const blocks = [{ starts_at: "2026-09-06T16:30:00.000Z" }];
    expect(filterActualCustodyTransitions(blocks, windowStart, windowEnd)).toHaveLength(1);
  });

  it("drops a block whose handover starts on or after windowEnd", () => {
    const blocks = [{ starts_at: "2026-09-07T08:30:00.000Z" }];
    expect(filterActualCustodyTransitions(blocks, windowStart, windowEnd)).toEqual([]);
  });

  it("drops a block whose handover started before windowStart", () => {
    const blocks = [{ starts_at: "2026-09-04T23:59:59.000Z" }];
    expect(filterActualCustodyTransitions(blocks, windowStart, windowEnd)).toEqual([]);
  });

  it("filters a mixed list to only the real transitions", () => {
    const blocks = [
      { starts_at: "2026-09-04T16:30:00.000Z" }, // stale Friday handover — drop
      { starts_at: "2026-09-06T08:30:00.000Z" }, // real transition tomorrow — keep
    ];
    const result = filterActualCustodyTransitions(blocks, windowStart, windowEnd);
    expect(result).toEqual([{ starts_at: "2026-09-06T08:30:00.000Z" }]);
  });
});
