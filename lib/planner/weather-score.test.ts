import { describe, expect, it } from "vitest";
import { scoreWeatherSuitability } from "./weather-score";

describe("scoreWeatherSuitability", () => {
  it("returns a neutral 50 when temperature is unknown", () => {
    expect(scoreWeatherSuitability({ tempF: null, precipChancePercent: null, windMph: null })).toBe(50);
  });

  it("scores a perfect day (68F, no rain, calm) near 100", () => {
    const score = scoreWeatherSuitability({ tempF: 68, precipChancePercent: 0, windMph: 5 });
    expect(score).toBe(100);
  });

  it("penalizes cold temperatures", () => {
    const cold = scoreWeatherSuitability({ tempF: 35, precipChancePercent: 0, windMph: 5 });
    const mild = scoreWeatherSuitability({ tempF: 68, precipChancePercent: 0, windMph: 5 });
    expect(cold).toBeLessThan(mild);
  });

  it("penalizes hot temperatures", () => {
    const hot = scoreWeatherSuitability({ tempF: 100, precipChancePercent: 0, windMph: 5 });
    const mild = scoreWeatherSuitability({ tempF: 68, precipChancePercent: 0, windMph: 5 });
    expect(hot).toBeLessThan(mild);
  });

  it("penalizes high precipitation chance", () => {
    const rainy = scoreWeatherSuitability({ tempF: 68, precipChancePercent: 90, windMph: 5 });
    const dry = scoreWeatherSuitability({ tempF: 68, precipChancePercent: 0, windMph: 5 });
    expect(rainy).toBeLessThan(dry);
  });

  it("penalizes high wind", () => {
    const windy = scoreWeatherSuitability({ tempF: 68, precipChancePercent: 0, windMph: 30 });
    const calm = scoreWeatherSuitability({ tempF: 68, precipChancePercent: 0, windMph: 5 });
    expect(windy).toBeLessThan(calm);
  });

  it("never returns below 0 or above 100", () => {
    const terrible = scoreWeatherSuitability({ tempF: -20, precipChancePercent: 100, windMph: 60 });
    expect(terrible).toBeGreaterThanOrEqual(0);
    expect(terrible).toBeLessThanOrEqual(100);
  });
});
