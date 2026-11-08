import { describe, expect, it } from "vitest";
import { describePartnerAvailability, summarizePartnerAvailability } from "./partner-availability";
import type { AvailabilityScheduleLike } from "../availability/expand";

const BRITTNEY = { id: "b", full_name: "Brittney Lane", nickname: null, relationship_label: "Girlfriend" };

// Every Saturday and Sunday of week 1 (days 5, 6), free in week 2. Anchor Monday Nov 2, 2026.
const kidsWeekend: AvailabilityScheduleLike = {
  id: "s",
  person_id: "b",
  kind: "busy",
  label: "Kids' weekends",
  cycle_length_days: 14,
  pattern: [5, 6].map((dayIndex) => ({ dayIndex, startTime: null, endTime: null })),
  anchor_date: "2026-11-02",
  start_date: "2026-11-02",
  end_date: null,
  skip_ranges: [],
};

describe("summarizePartnerAvailability", () => {
  it("marks both days busy on her kids' weekend", () => {
    // Sat Nov 7 / Sun Nov 8 fall in week 1.
    const [entry] = summarizePartnerAvailability([BRITTNEY], [kidsWeekend], new Date(2026, 10, 7), new Date(2026, 10, 8));
    expect(entry).toMatchObject({ name: "Brittney Lane", relationship: "girlfriend", saturday: "busy", sunday: "busy", reason: "Kids' weekends" });
  });

  it("marks both days free on the off weekend", () => {
    const [entry] = summarizePartnerAvailability([BRITTNEY], [kidsWeekend], new Date(2026, 10, 14), new Date(2026, 10, 15));
    expect(entry).toMatchObject({ saturday: "free", sunday: "free" });
  });

  it("ignores people with no busy pattern", () => {
    expect(summarizePartnerAvailability([{ id: "x", full_name: "X", nickname: null }], [kidsWeekend], new Date(2026, 10, 7), new Date(2026, 10, 8))).toEqual([]);
  });
});

describe("describePartnerAvailability", () => {
  it("says nothing when nobody has a pattern", () => {
    expect(describePartnerAvailability([])).toEqual([]);
  });

  it("states each day and the reason when busy", () => {
    const lines = describePartnerAvailability([
      { name: "Brittney", relationship: "girlfriend", reason: "Kids' weekends", saturday: "busy", sunday: "free" },
    ]);
    expect(lines.join("\n")).toContain("Brittney (girlfriend): Saturday busy, Sunday free -- Kids' weekends");
  });
});
