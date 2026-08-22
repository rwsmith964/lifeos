import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOdfwReport } from "./odfw";
import * as systemRepo from "../db/repositories/system";

vi.mock("../db/repositories/system", () => ({
  getCachedExternalData: vi.fn(),
  upsertExternalDataCache: vi.fn(),
}));

const fakeClient = {} as never;
const ZONE_URL = "https://myodfw.com/recreation-report/zones/willamette";

beforeEach(() => {
  vi.mocked(systemRepo.getCachedExternalData).mockReset();
  vi.mocked(systemRepo.upsertExternalDataCache).mockReset();
});

describe("getOdfwReport", () => {
  it("strips HTML tags/scripts/styles down to plain text", async () => {
    vi.mocked(systemRepo.getCachedExternalData).mockResolvedValue(null);
    vi.mocked(systemRepo.upsertExternalDataCache).mockResolvedValue({} as never);
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        "<html><head><style>.x{}</style><script>evil()</script></head><body><h1>Willamette Zone</h1><p>Fishing is good&nbsp;this week.</p></body></html>",
    });

    const result = await getOdfwReport(fakeClient, ZONE_URL, { fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(result.available).toBe(true);
    expect(result.data?.reportText).toContain("Willamette Zone");
    expect(result.data?.reportText).toContain("Fishing is good this week.");
    expect(result.data?.reportText).not.toContain("evil()");
    expect(result.data?.reportText).not.toContain("<");
  });

  it("degrades gracefully on a fetch failure instead of guessing", async () => {
    vi.mocked(systemRepo.getCachedExternalData).mockResolvedValue(null);
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 });

    const result = await getOdfwReport(fakeClient, ZONE_URL, { fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(result.available).toBe(false);
    expect(result.data).toBeNull();
  });

  it("degrades gracefully when the page structure changed and no text extracts", async () => {
    vi.mocked(systemRepo.getCachedExternalData).mockResolvedValue(null);
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, text: async () => "<html><body></body></html>" });

    const result = await getOdfwReport(fakeClient, ZONE_URL, { fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(result.available).toBe(false);
  });

  it("sends an identifying User-Agent", async () => {
    vi.mocked(systemRepo.getCachedExternalData).mockResolvedValue(null);
    vi.mocked(systemRepo.upsertExternalDataCache).mockResolvedValue({} as never);
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, text: async () => "<p>report</p>" });

    await getOdfwReport(fakeClient, ZONE_URL, { fetchImpl: fetchImpl as unknown as typeof fetch });

    const options = fetchImpl.mock.calls[0][1] as { headers: Record<string, string> };
    expect(options.headers["User-Agent"]).toBeTruthy();
  });
});
