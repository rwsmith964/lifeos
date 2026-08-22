import { describe, expect, it } from "vitest";
import { computeSolunarPeriods } from "./solunar";

const DEXTER_RESERVOIR = { lat: 43.8965, lng: -122.8195 };

describe("computeSolunarPeriods", () => {
  const result = computeSolunarPeriods(new Date(2026, 7, 21), DEXTER_RESERVOIR.lat, DEXTER_RESERVOIR.lng);

  it("returns exactly 2 major periods and up to 2 minor periods", () => {
    const majors = result.periods.filter((p) => p.type === "major");
    const minors = result.periods.filter((p) => p.type === "minor");
    expect(majors).toHaveLength(2);
    expect(minors.length).toBeLessThanOrEqual(2);
  });

  it("major periods are 2 hours wide", () => {
    for (const period of result.periods.filter((p) => p.type === "major")) {
      const minutes = (period.end.getTime() - period.start.getTime()) / 60000;
      expect(minutes).toBe(120);
    }
  });

  it("minor periods are 1 hour wide", () => {
    for (const period of result.periods.filter((p) => p.type === "minor")) {
      const minutes = (period.end.getTime() - period.start.getTime()) / 60000;
      expect(minutes).toBe(60);
    }
  });

  it("returns periods sorted by start time ascending", () => {
    const starts = result.periods.map((p) => p.start.getTime());
    const sorted = [...starts].sort((a, b) => a - b);
    expect(starts).toEqual(sorted);
  });

  it("moon phase fraction is between 0 and 1", () => {
    expect(result.moonPhaseFraction).toBeGreaterThanOrEqual(0);
    expect(result.moonPhaseFraction).toBeLessThanOrEqual(1);
  });

  it("is deterministic for the same date/location", () => {
    const again = computeSolunarPeriods(new Date(2026, 7, 21), DEXTER_RESERVOIR.lat, DEXTER_RESERVOIR.lng);
    expect(again.periods.map((p) => p.start.getTime())).toEqual(
      result.periods.map((p) => p.start.getTime())
    );
  });
});
