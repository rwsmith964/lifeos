import { beforeEach, describe, expect, it, vi } from "vitest";
import { getNoaaTidePredictions } from "./noaa-tides";
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

describe("getNoaaTidePredictions", () => {
  it("maps H/L type codes to high/low", async () => {
    vi.mocked(systemRepo.getCachedExternalData).mockResolvedValue(null);
    vi.mocked(systemRepo.upsertExternalDataCache).mockResolvedValue({} as never);
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        predictions: [
          { t: "2026-08-21 05:23", v: "6.234", type: "H" },
          { t: "2026-08-21 11:45", v: "0.812", type: "L" },
        ],
      }),
    });

    const result = await getNoaaTidePredictions(fakeClient, "9432780", new Date(2026, 7, 21), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.available).toBe(true);
    expect(result.data?.predictions).toEqual([
      { time: "2026-08-21 05:23", heightFt: 6.234, type: "high" },
      { time: "2026-08-21 11:45", heightFt: 0.812, type: "low" },
    ]);
  });

  it("treats a NOAA API-level error payload as unavailable, not a crash", async () => {
    vi.mocked(systemRepo.getCachedExternalData).mockResolvedValue(null);
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: { message: "No data was found" } }),
    });

    const result = await getNoaaTidePredictions(fakeClient, "0000000", new Date(2026, 7, 21), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.available).toBe(false);
    expect(result.data).toBeNull();
  });
});
