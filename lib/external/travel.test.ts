import { describe, expect, it, vi } from "vitest";
import { getTravelTime, haversineMiles, haversineTravelTimeMinutes } from "./travel";

const EUGENE: { lat: number; lng: number } = { lat: 44.0521, lng: -123.0868 };
const DEXTER_RESERVOIR = { lat: 43.8965, lng: -122.8195 };

describe("haversineMiles", () => {
  it("returns 0 for identical points", () => {
    expect(haversineMiles(EUGENE, EUGENE)).toBe(0);
  });

  it("returns a plausible distance for two real Oregon locations", () => {
    const miles = haversineMiles(EUGENE, DEXTER_RESERVOIR);
    expect(miles).toBeGreaterThan(10);
    expect(miles).toBeLessThan(25);
  });
});

describe("haversineTravelTimeMinutes", () => {
  it("applies the 1.4x road factor and 45mph assumption", () => {
    const origin = { lat: 0, lng: 0 };
    // ~1 degree of longitude at the equator is ~69 miles
    const destination = { lat: 0, lng: 1 };
    const straightLineMiles = haversineMiles(origin, destination);
    const expectedMinutes = Math.round(((straightLineMiles * 1.4) / 45) * 60);
    expect(haversineTravelTimeMinutes(origin, destination)).toBe(expectedMinutes);
  });

  it("returns 0 for identical origin and destination", () => {
    expect(haversineTravelTimeMinutes(EUGENE, EUGENE)).toBe(0);
  });
});

describe("getTravelTime", () => {
  it("falls back to haversine when no API keys are configured", async () => {
    const result = await getTravelTime(EUGENE, DEXTER_RESERVOIR, {});
    expect(result.source).toBe("haversine_fallback");
    expect(result.minutes).toBeGreaterThan(0);
  });

  it("uses Google Maps when a key is configured and the call succeeds", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        rows: [{ elements: [{ status: "OK", duration: { value: 1800 } }] }],
      }),
    });
    const result = await getTravelTime(EUGENE, DEXTER_RESERVOIR, {
      googleMapsApiKey: "fake-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ minutes: 30, source: "google" });
  });

  it("falls back to haversine when Google Maps returns a non-OK element status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rows: [{ elements: [{ status: "ZERO_RESULTS" }] }] }),
    });
    const result = await getTravelTime(EUGENE, DEXTER_RESERVOIR, {
      googleMapsApiKey: "fake-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.source).toBe("haversine_fallback");
  });

  it("falls back to haversine when the Google Maps request throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await getTravelTime(EUGENE, DEXTER_RESERVOIR, {
      googleMapsApiKey: "fake-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.source).toBe("haversine_fallback");
  });

  it("tries Mapbox when Google is not configured but Mapbox is", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: "Ok", durations: [[0, 1200]] }),
    });
    const result = await getTravelTime(EUGENE, DEXTER_RESERVOIR, {
      mapboxAccessToken: "fake-token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ minutes: 20, source: "mapbox" });
  });
});
