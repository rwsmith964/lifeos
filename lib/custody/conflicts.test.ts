import { describe, expect, it } from "vitest";
import { detectCustodyWorkConflicts, type CustodyBlockLike } from "./conflicts";

const MOM = { id: "person-mom", full_name: "Jane Smith", nickname: null };
const CHILD = { id: "person-child", full_name: "Callan Smith", nickname: "Cal" };

function makeBlock(overrides: Partial<CustodyBlockLike> = {}): CustodyBlockLike {
  return {
    id: "block-1",
    child_person_id: "person-child",
    responsible_person_id: "person-mom",
    starts_at: "2026-08-26T15:00:00.000Z",
    ends_at: "2026-08-26T22:00:00.000Z",
    ...overrides,
  };
}

function makeSchedule(overrides: Record<string, unknown> = {}) {
  return {
    id: "schedule-1",
    person_id: "person-mom",
    day_of_week: new Date("2026-08-26T15:00:00.000Z").getDay(),
    start_time: "09:00",
    end_time: "17:00",
    label: "Work",
    ...overrides,
  };
}

describe("detectCustodyWorkConflicts", () => {
  it("flags a block whose responsible person has an overlapping work shift", () => {
    const conflicts = detectCustodyWorkConflicts([makeBlock()], [makeSchedule()], [], [MOM, CHILD]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].childName).toBe("Cal");
    expect(conflicts[0].responsiblePersonName).toBe("Jane Smith");
    expect(conflicts[0].custodyBlockId).toBe("block-1");
  });

  it("does not flag a block when the responsible person's shift doesn't overlap the window", () => {
    // Shift ends 17:00 local; block starts well after in a timezone-safe way
    // by using a schedule with no overlap at all (different day of week).
    const conflicts = detectCustodyWorkConflicts(
      [makeBlock()],
      [makeSchedule({ day_of_week: (new Date("2026-08-26T15:00:00.000Z").getDay() + 1) % 7 })],
      [],
      [MOM, CHILD]
    );
    expect(conflicts).toHaveLength(0);
  });

  it("does not flag a block when the responsible person has no work_schedules rows at all", () => {
    const conflicts = detectCustodyWorkConflicts([makeBlock()], [], [], [MOM, CHILD]);
    expect(conflicts).toHaveLength(0);
  });

  it("ignores another person's work schedule even if their id happens to match a different block", () => {
    const otherBlock = makeBlock({ id: "block-2", responsible_person_id: "person-other" });
    const conflicts = detectCustodyWorkConflicts([makeBlock(), otherBlock], [makeSchedule()], [], [MOM, CHILD]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].custodyBlockId).toBe("block-1");
  });

  it("suppresses a conflict when the responsible person has time off covering the shift day", () => {
    const conflicts = detectCustodyWorkConflicts(
      [makeBlock()],
      [makeSchedule()],
      [{ id: "timeoff-1", person_id: "person-mom", start_date: "2026-08-26", end_date: "2026-08-26", reason: "PTO" }],
      [MOM, CHILD]
    );
    expect(conflicts).toHaveLength(0);
  });

  it("returns nothing when there are no custody blocks", () => {
    expect(detectCustodyWorkConflicts([], [makeSchedule()], [], [MOM, CHILD])).toHaveLength(0);
  });
});
