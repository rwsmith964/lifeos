// D-165 (QUEUE-006): unit coverage for the pure viability-gate helpers that
// generate.ts wires into weekend-plan candidate scoring/exclusion.
import { describe, expect, it } from "vitest";
import { isViabilityUnmet, resolveViabilityInputs } from "./viability-gate";

describe("resolveViabilityInputs", () => {
  it("falls back to the location-only heuristic when no config exists", () => {
    const flags = resolveViabilityInputs(null, { usgs_gauge: "gauge-1" });
    expect(flags.configured).toBe(false);
    expect(flags.wantsRiverFlow).toBe(true);
    expect(flags.wantsOdfw).toBe(false);
    expect(flags.wantsTide).toBe(false);
    // Original isFishingRelevantLocation heuristic: usgs OR odfw implies solunar.
    expect(flags.wantsSolunar).toBe(true);
  });

  it("treats an empty relevant_inputs array the same as no config", () => {
    const flags = resolveViabilityInputs([], { odfw_zone_url: "zone-1" });
    expect(flags.configured).toBe(false);
    expect(flags.wantsOdfw).toBe(true);
    expect(flags.wantsSolunar).toBe(true);
  });

  it("infers no relevance when the location has no fishing-relevant external_ids and no config exists", () => {
    const flags = resolveViabilityInputs(undefined, null);
    expect(flags.configured).toBe(false);
    expect(flags.wantsRiverFlow).toBe(false);
    expect(flags.wantsOdfw).toBe(false);
    expect(flags.wantsTide).toBe(false);
    expect(flags.wantsSolunar).toBe(false);
  });

  it("makes a saved config authoritative, narrowing what's fetched even if the location has other external_ids", () => {
    // Household says only weather + solunar matter for this type -- river
    // flow/ODFW/tide should NOT be requested even though this location
    // happens to have a usgs_gauge on file.
    const flags = resolveViabilityInputs(["weather", "solunar"], { usgs_gauge: "gauge-1", odfw_zone_url: "zone-1" });
    expect(flags.configured).toBe(true);
    expect(flags.wantsRiverFlow).toBe(false);
    expect(flags.wantsOdfw).toBe(false);
    expect(flags.wantsTide).toBe(false);
    expect(flags.wantsSolunar).toBe(true);
  });

  it("is case-insensitive on the saved tags", () => {
    const flags = resolveViabilityInputs(["River_Flow", "TIDE"], {});
    expect(flags.wantsRiverFlow).toBe(true);
    expect(flags.wantsTide).toBe(true);
  });
});

describe("isViabilityUnmet", () => {
  it("never fires when no config exists for the activity type", () => {
    const flags = resolveViabilityInputs(null, {});
    expect(isViabilityUnmet(flags, {})).toBe(false);
  });

  it("never fires for a config that only names weather and/or solunar", () => {
    const flags = resolveViabilityInputs(["weather", "solunar"], {});
    expect(isViabilityUnmet(flags, {})).toBe(false);
  });

  it("fires when the declared input has no matching location data at all", () => {
    const flags = resolveViabilityInputs(["river_flow"], {});
    expect(isViabilityUnmet(flags, {})).toBe(true);
  });

  it("does not fire when at least one declared, data-backed input is satisfied", () => {
    const flags = resolveViabilityInputs(["river_flow", "odfw"], { usgs_gauge: "gauge-1" });
    expect(isViabilityUnmet(flags, { usgs_gauge: "gauge-1" })).toBe(false);
  });

  it("fires when the config declares tide but the location has no noaa_station", () => {
    const flags = resolveViabilityInputs(["tide"], { usgs_gauge: "gauge-1" });
    // usgs_gauge is present, but the household said tide (not river flow)
    // matters for this type, and there's no noaa_station.
    expect(isViabilityUnmet(flags, { usgs_gauge: "gauge-1" })).toBe(true);
  });
});
