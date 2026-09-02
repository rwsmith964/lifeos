import { describe, expect, it } from "vitest";
import { buildMonthCellChips, buildMonthCellCustodyBars, type MonthCellItemLike, type CustodyBlockLike } from "./month-cell";

describe("buildMonthCellChips", () => {
  it("renders a timed item's chip with a lowercase time prefix", () => {
    const items: MonthCellItemLike[] = [
      { id: "1", title: "Soccer Practice", startsAt: new Date(2026, 8, 2, 17, 0), allDay: false, kind: "event" },
    ];
    const result = buildMonthCellChips(items, 3);
    expect(result.visible).toEqual([{ id: "1", kind: "event", label: "5:00pm Soccer Practice" }]);
    expect(result.overflowCount).toBe(0);
  });

  it("renders an all-day item's chip with no time prefix", () => {
    const items: MonthCellItemLike[] = [
      { id: "1", title: "Jaime Birthday", startsAt: new Date(2026, 8, 10), allDay: true, kind: "birthday" },
    ];
    const result = buildMonthCellChips(items, 3);
    expect(result.visible[0].label).toBe("Jaime Birthday");
  });

  it("caps visible chips and reports the overflow count", () => {
    const items: MonthCellItemLike[] = Array.from({ length: 5 }, (_, i) => ({
      id: `${i}`,
      title: `Event ${i}`,
      startsAt: new Date(2026, 8, 2, 9 + i, 0),
      allDay: false,
      kind: "event" as const,
    }));
    const result = buildMonthCellChips(items, 2);
    expect(result.visible).toHaveLength(2);
    expect(result.overflowCount).toBe(3);
  });

  it("excludes custody items from the chip slot budget entirely", () => {
    const items: MonthCellItemLike[] = [
      { id: "c1", title: "Cal with Richard", startsAt: new Date(2026, 8, 2), allDay: false, kind: "custody" },
      { id: "e1", title: "Dentist", startsAt: new Date(2026, 8, 2, 9, 0), allDay: false, kind: "event" },
    ];
    const result = buildMonthCellChips(items, 3);
    expect(result.visible).toHaveLength(1);
    expect(result.visible[0].id).toBe("e1");
    expect(result.overflowCount).toBe(0);
  });
});

describe("buildMonthCellCustodyBars", () => {
  const day = new Date(2026, 8, 2);

  it("renders a full-day block as one 0-100% segment", () => {
    const blocks: CustodyBlockLike[] = [
      {
        id: "b1",
        childPersonId: "child-1",
        responsiblePersonId: "parent-1",
        startsAt: new Date(2026, 8, 2, 0, 0),
        endsAt: new Date(2026, 8, 3, 0, 0),
      },
    ];
    const rows = buildMonthCellCustodyBars(day, blocks);
    expect(rows).toEqual([
      {
        childPersonId: "child-1",
        segments: [{ startPercent: 0, widthPercent: 100, responsiblePersonId: "parent-1" }],
      },
    ]);
  });

  it("splits a handover day into two segments in two colors", () => {
    const blocks: CustodyBlockLike[] = [
      {
        id: "b1",
        childPersonId: "child-1",
        responsiblePersonId: "parent-1",
        startsAt: new Date(2026, 8, 2, 0, 0),
        endsAt: new Date(2026, 8, 2, 15, 0),
      },
      {
        id: "b2",
        childPersonId: "child-1",
        responsiblePersonId: "parent-2",
        startsAt: new Date(2026, 8, 2, 15, 0),
        endsAt: new Date(2026, 8, 3, 0, 0),
      },
    ];
    const rows = buildMonthCellCustodyBars(day, blocks);
    expect(rows).toHaveLength(1);
    expect(rows[0].segments).toHaveLength(2);
    expect(rows[0].segments[0]).toEqual({ startPercent: 0, widthPercent: 62.5, responsiblePersonId: "parent-1" });
    expect(rows[0].segments[1]).toEqual({ startPercent: 62.5, widthPercent: 37.5, responsiblePersonId: "parent-2" });
  });

  it("clips a multi-day block to just this day's slice", () => {
    const blocks: CustodyBlockLike[] = [
      {
        id: "b1",
        childPersonId: "child-1",
        responsiblePersonId: "parent-1",
        startsAt: new Date(2026, 8, 1, 12, 0), // starts the day before
        endsAt: new Date(2026, 8, 4, 0, 0), // ends two days later
      },
    ];
    const rows = buildMonthCellCustodyBars(day, blocks);
    expect(rows[0].segments).toEqual([{ startPercent: 0, widthPercent: 100, responsiblePersonId: "parent-1" }]);
  });

  it("produces one row per child, sorted by child id", () => {
    const blocks: CustodyBlockLike[] = [
      { id: "b1", childPersonId: "z-child", responsiblePersonId: "p1", startsAt: day, endsAt: new Date(2026, 8, 3) },
      { id: "b2", childPersonId: "a-child", responsiblePersonId: "p2", startsAt: day, endsAt: new Date(2026, 8, 3) },
    ];
    const rows = buildMonthCellCustodyBars(day, blocks);
    expect(rows.map((r) => r.childPersonId)).toEqual(["a-child", "z-child"]);
  });

  it("returns an empty array when there are no custody blocks that day", () => {
    expect(buildMonthCellCustodyBars(day, [])).toEqual([]);
  });
});
