import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUsgsGaugeReading } from "./usgs";
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

const SAMPLE_RESPONSE = {
  value: {
    timeSeries: [
      {
        variable: { variableCode: [{ value: "00060" }] },
        values: [{ value: [{ value: "245.0", dateTime: "2026-08-21T12:00:00.000-07:00" }] }],
      },
      {
        variable: { variableCode: [{ value: "00065" }] },
        values: [{ value: [{ value: "3.21", dateTime: "2026-08-21T12:00:00.000-07:00" }] }],
      },
      {
        variable: { variableCode: [{ value: "00010" }] },
        values: [{ value: [{ value: "16.5", dateTime: "2026-08-21T12:00:00.000-07:00" }] }],
      },
    ],
  },
};

describe("getUsgsGaugeReading", () => {
  it("parses discharge, gauge height, and water temp from the timeSeries", async () => {
    vi.mocked(systemRepo.getCachedExternalData).mockResolvedValue(null);
    vi.mocked(systemRepo.upsertExternalDataCache).mockResolvedValue({} as never);
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => SAMPLE_RESPONSE });

    const result = await getUsgsGaugeReading(fakeClient, "14150000", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.available).toBe(true);
    expect(result.data).toEqual({
      gaugeId: "14150000",
      observedAt: "2026-08-21T12:00:00.000-07:00",
      flowCfs: 245.0,
      gaugeHeightFt: 3.21,
      waterTempC: 16.5,
    });
  });

  it("handles a missing parameter gracefully (null rather than throwing)", async () => {
    vi.mocked(systemRepo.getCachedExternalData).mockResolvedValue(null);
    vi.mocked(systemRepo.upsertExternalDataCache).mockResolvedValue({} as never);
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ value: { timeSeries: [SAMPLE_RESPONSE.value.timeSeries[0]] } }),
    });

    const result = await getUsgsGaugeReading(fakeClient, "14150000", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.data?.flowCfs).toBe(245.0);
    expect(result.data?.gaugeHeightFt).toBeNull();
    expect(result.data?.waterTempC).toBeNull();
  });

  it("returns available:false on a non-OK HTTP response, never guessing a value", async () => {
    vi.mocked(systemRepo.getCachedExternalData).mockResolvedValue(null);
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 });

    const result = await getUsgsGaugeReading(fakeClient, "14150000", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.available).toBe(false);
    expect(result.data).toBeNull();
  });
});
