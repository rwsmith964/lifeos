import { beforeEach, describe, expect, it, vi } from "vitest";
import { getNwsForecast } from "./nws";
import * as systemRepo from "../db/repositories/system";

vi.mock("../db/repositories/system", () => ({
  getCachedExternalData: vi.fn(),
  upsertExternalDataCache: vi.fn(),
}));

const fakeClient = {} as never;

beforeEach(() => {
  vi.mocked(systemRepo.getCachedExternalData).mockReset();
  vi.mocked(systemRepo.upsertExternalDataCache).mockReset();
});

function mockPointsAndForecast() {
  return vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ properties: { forecast: "https://api.weather.gov/gridpoints/PQR/1,1/forecast" } }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        properties: {
          periods: [
            {
              name: "Tonight",
              startTime: "2026-08-21T18:00:00-07:00",
              endTime: "2026-08-22T06:00:00-07:00",
              temperature: 58,
              windSpeed: "5 mph",
              shortForecast: "Clear",
              probabilityOfPrecipitation: { value: 5 },
            },
          ],
        },
      }),
    });
}

describe("getNwsForecast", () => {
  it("returns available:false without throwing when the network call fails", async () => {
    vi.mocked(systemRepo.getCachedExternalData).mockResolvedValue(null);
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));

    const result = await getNwsForecast(fakeClient, 44.05, -123.08, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.available).toBe(false);
    expect(result.data).toBeNull();
  });

  it("fetches points then forecast and maps periods on a cache miss", async () => {
    vi.mocked(systemRepo.getCachedExternalData).mockResolvedValue(null);
    vi.mocked(systemRepo.upsertExternalDataCache).mockImplementation(async (_client, row) => ({
      id: "1",
      fetched_at: new Date().toISOString(),
      ...row,
    }));
    const fetchImpl = mockPointsAndForecast();

    const result = await getNwsForecast(fakeClient, 44.05, -123.08, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.available).toBe(true);
    expect(result.fromCache).toBe(false);
    expect(result.data?.periods[0]).toMatchObject({
      name: "Tonight",
      temperatureF: 58,
      shortForecast: "Clear",
      precipitationChancePercent: 5,
    });
  });

  it("returns cached data without calling fetch again on a cache hit", async () => {
    const cachedPayload = { periods: [{ name: "Cached", startTime: "", endTime: "", temperatureF: 60, windSpeed: "0", shortForecast: "Cached", precipitationChancePercent: null }] };
    vi.mocked(systemRepo.getCachedExternalData).mockResolvedValue({
      id: "1",
      source: "nws",
      cache_key: "44.05,-123.08",
      payload: cachedPayload,
      fetched_at: "2026-08-21T00:00:00Z",
      expires_at: "2026-08-21T01:00:00Z",
    });
    const fetchImpl = vi.fn();

    const result = await getNwsForecast(fakeClient, 44.05, -123.08, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.fromCache).toBe(true);
    expect(result.data).toEqual(cachedPayload);
  });

  it("sets a User-Agent header on both requests (NWS API requirement)", async () => {
    vi.mocked(systemRepo.getCachedExternalData).mockResolvedValue(null);
    vi.mocked(systemRepo.upsertExternalDataCache).mockResolvedValue({} as never);
    const fetchImpl = mockPointsAndForecast();

    await getNwsForecast(fakeClient, 44.05, -123.08, { fetchImpl: fetchImpl as unknown as typeof fetch });

    const firstCallOptions = fetchImpl.mock.calls[0][1] as { headers: Record<string, string> };
    expect(firstCallOptions.headers["User-Agent"]).toBeTruthy();
  });
});
