import { describe, expect, it, vi } from "vitest";
import { geocodeAddress } from "./geocode";

describe("geocodeAddress", () => {
  it("returns not_found for a blank address without calling fetch", async () => {
    const fetchImpl = vi.fn();
    const result = await geocodeAddress("   ", { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.status).toBe("not_found");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns ok with parsed lat/lng on a successful match", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { lat: "44.0521", lon: "-123.0868", display_name: "Eugene, Lane County, Oregon, USA" },
      ],
    });

    const result = await geocodeAddress("1234 Main St, Eugene, OR", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({
      status: "ok",
      result: { lat: 44.0521, lng: -123.0868, displayName: "Eugene, Lane County, Oregon, USA" },
    });
  });

  it("returns not_found when Nominatim's result array is empty", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    const result = await geocodeAddress("asdkfjhaskdjfh nonsense address", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.status).toBe("not_found");
  });

  it("returns an error result instead of throwing on HTTP failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    const result = await geocodeAddress("Eugene, OR", { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.status).toBe("error");
  });

  it("returns an error result instead of throwing when fetch rejects", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await geocodeAddress("Eugene, OR", { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.status).toBe("error");
  });

  it("sets a descriptive User-Agent header (Nominatim usage policy)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ lat: "44.0", lon: "-123.0", display_name: "Somewhere" }],
    });
    await geocodeAddress("Eugene, OR", { fetchImpl: fetchImpl as unknown as typeof fetch });
    const [, options] = fetchImpl.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(options.headers["User-Agent"]).toBeTruthy();
  });
});
