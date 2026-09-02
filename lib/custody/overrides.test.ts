import { describe, expect, it } from "vitest";
import { resolveCustodyBlockOverrides } from "./overrides";
import type { CustodyBlockRow } from "../db/database.types";

const CHILD_A = "person-cal";
const CHILD_B = "person-emlyn";

function makeBlock(overrides: Partial<CustodyBlockRow> = {}): CustodyBlockRow {
  return {
    id: "existing-1",
    household_id: "household-1",
    child_person_id: CHILD_A,
    responsible_person_id: "person-richard",
    starts_at: "2026-09-04T16:30:00.000Z",
    ends_at: "2026-09-07T08:30:00.000Z",
    block_type: "regular",
    notes: "",
    location: null,
    custody_schedule_id: "schedule-1",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("resolveCustodyBlockOverrides", () => {
  it("reproduces the reported bug: a vacation override spanning a regular schedule block deletes the stale block", () => {
    // Exact shape of the live data that produced the reported bug: a
    // regular-schedule block for Cal (Sept 4 16:30 - Sept 7 08:30, Richard
    // responsible) fully inside a new vacation override (Sept 2 - Sept 7,
    // Mel responsible).
    const existing = makeBlock();
    const resolutions = resolveCustodyBlockOverrides([existing], {
      childPersonId: CHILD_A,
      startsAt: "2026-09-02T11:00:00.000Z",
      endsAt: "2026-09-07T11:00:00.000Z",
    });
    expect(resolutions).toEqual([{ action: "delete", blockId: "existing-1" }]);
  });

  it("ignores blocks for a different child", () => {
    const existing = makeBlock({ child_person_id: CHILD_B });
    const resolutions = resolveCustodyBlockOverrides([existing], {
      childPersonId: CHILD_A,
      startsAt: "2026-09-02T11:00:00.000Z",
      endsAt: "2026-09-07T11:00:00.000Z",
    });
    expect(resolutions).toEqual([]);
  });

  it("ignores blocks with no overlap at all", () => {
    const existing = makeBlock({ starts_at: "2026-09-10T00:00:00.000Z", ends_at: "2026-09-12T00:00:00.000Z" });
    const resolutions = resolveCustodyBlockOverrides([existing], {
      childPersonId: CHILD_A,
      startsAt: "2026-09-05T00:00:00.000Z",
      endsAt: "2026-09-07T00:00:00.000Z",
    });
    expect(resolutions).toEqual([]);
  });

  it("truncates an existing block's end when it extends before the override but ends inside it", () => {
    const existing = makeBlock({ starts_at: "2026-09-01T00:00:00.000Z", ends_at: "2026-09-06T00:00:00.000Z" });
    const resolutions = resolveCustodyBlockOverrides([existing], {
      childPersonId: CHILD_A,
      startsAt: "2026-09-05T00:00:00.000Z",
      endsAt: "2026-09-07T00:00:00.000Z",
    });
    expect(resolutions).toEqual([
      { action: "truncate_end", blockId: "existing-1", newEndsAt: "2026-09-05T00:00:00.000Z" },
    ]);
  });

  it("truncates an existing block's start when it begins inside the override but extends past it", () => {
    const existing = makeBlock({ starts_at: "2026-09-06T00:00:00.000Z", ends_at: "2026-09-10T00:00:00.000Z" });
    const resolutions = resolveCustodyBlockOverrides([existing], {
      childPersonId: CHILD_A,
      startsAt: "2026-09-05T00:00:00.000Z",
      endsAt: "2026-09-07T00:00:00.000Z",
    });
    expect(resolutions).toEqual([
      { action: "truncate_start", blockId: "existing-1", newStartsAt: "2026-09-07T00:00:00.000Z" },
    ]);
  });

  it("splits an existing block that fully spans a shorter override into a before/after pair", () => {
    const existing = makeBlock({ starts_at: "2026-09-01T00:00:00.000Z", ends_at: "2026-09-12T00:00:00.000Z" });
    const resolutions = resolveCustodyBlockOverrides([existing], {
      childPersonId: CHILD_A,
      startsAt: "2026-09-05T00:00:00.000Z",
      endsAt: "2026-09-07T00:00:00.000Z",
    });
    expect(resolutions).toEqual([
      {
        action: "split",
        blockId: "existing-1",
        beforeEndsAt: "2026-09-05T00:00:00.000Z",
        afterStartsAt: "2026-09-07T00:00:00.000Z",
      },
    ]);
  });

  it("deletes an existing block exactly equal to the override's span", () => {
    const existing = makeBlock({ starts_at: "2026-09-05T00:00:00.000Z", ends_at: "2026-09-07T00:00:00.000Z" });
    const resolutions = resolveCustodyBlockOverrides([existing], {
      childPersonId: CHILD_A,
      startsAt: "2026-09-05T00:00:00.000Z",
      endsAt: "2026-09-07T00:00:00.000Z",
    });
    expect(resolutions).toEqual([{ action: "delete", blockId: "existing-1" }]);
  });

  it("excludes a block via excludeBlockId (editing a block shouldn't reconcile against itself)", () => {
    const existing = makeBlock({ id: "self", starts_at: "2026-09-05T00:00:00.000Z", ends_at: "2026-09-07T00:00:00.000Z" });
    const resolutions = resolveCustodyBlockOverrides([existing], {
      childPersonId: CHILD_A,
      startsAt: "2026-09-05T00:00:00.000Z",
      endsAt: "2026-09-07T00:00:00.000Z",
      excludeBlockId: "self",
    });
    expect(resolutions).toEqual([]);
  });

  it("resolves multiple overlapping blocks independently, one-off or schedule-generated alike", () => {
    const scheduleBlock = makeBlock({ id: "schedule-block", custody_schedule_id: "schedule-1" });
    const priorOneOff = makeBlock({
      id: "prior-one-off",
      custody_schedule_id: null,
      starts_at: "2026-09-06T00:00:00.000Z",
      ends_at: "2026-09-09T00:00:00.000Z",
    });
    const resolutions = resolveCustodyBlockOverrides([scheduleBlock, priorOneOff], {
      childPersonId: CHILD_A,
      startsAt: "2026-09-02T11:00:00.000Z",
      endsAt: "2026-09-07T11:00:00.000Z",
    });
    expect(resolutions).toEqual([
      { action: "delete", blockId: "schedule-block" },
      { action: "truncate_start", blockId: "prior-one-off", newStartsAt: "2026-09-07T11:00:00.000Z" },
    ]);
  });

  it("treats touching-edge blocks (no real time overlap) as not overlapping", () => {
    const existing = makeBlock({ starts_at: "2026-09-07T00:00:00.000Z", ends_at: "2026-09-09T00:00:00.000Z" });
    const resolutions = resolveCustodyBlockOverrides([existing], {
      childPersonId: CHILD_A,
      startsAt: "2026-09-05T00:00:00.000Z",
      endsAt: "2026-09-07T00:00:00.000Z",
    });
    expect(resolutions).toEqual([]);
  });
});
