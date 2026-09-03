import { describe, expect, it, vi } from "vitest";
import { searchNearbyPlaces } from "./places";

const PORTLAND = { lat: 45.5152, lng: -122.6784 };

describe("searchNearbyPlaces", () => {
  it("returns not_configured without calling fetch when no API key is available", async () => {
    const fetchImpl = vi.fn();
    const result = await searchNearbyPlaces("golf course", PORTLAND, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ available: false, places: [], reason: "not_configured" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns an error for a blank query without calling fetch, even with a key configured", async () => {
    const fetchImpl = vi.fn();
    const result = await searchNearbyPlaces("   ", PORTLAND, {
      apiKey: "fake-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.available).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("maps a successful Places Text Search response into PlaceSuggestion rows", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        places: [
          {
            id: "places/abc123",
            displayName: { text: "Heron Lakes Golf Course" },
            formattedAddress: "3500 N Victory Blvd, Portland, OR 97217, USA",
            location: { latitude: 45.601, longitude: -122.698 },
            rating: 4.1,
            userRatingCount: 320,
          },
        ],
      }),
    });

    const result = await searchNearbyPlaces("golf course", PORTLAND, {
      apiKey: "fake-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({
      available: true,
      places: [
        {
          placeId: "places/abc123",
          name: "Heron Lakes Golf Course",
          address: "3500 N Victory Blvd, Portland, OR 97217, USA",
          lat: 45.601,
          lng: -122.698,
          rating: 4.1,
          userRatingCount: 320,
        },
      ],
    });

    // Sends the API key as a header (Places API New convention), never as
    // a query param, and biases the search around the given center point.
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers["X-Goog-Api-Key"]).toBe("fake-key");
    const body = JSON.parse(init.body);
    expect(body.textQuery).toBe("golf course");
    expect(body.locationBias.circle.center).toEqual({ latitude: PORTLAND.lat, longitude: PORTLAND.lng });
  });

  it("returns available:true with an empty list when Google finds nothing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const result = await searchNearbyPlaces("nonexistent activity type xyz", PORTLAND, {
      apiKey: "fake-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ available: true, places: [] });
  });

  it("returns an error result instead of throwing on HTTP failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "PERMISSION_DENIED" });
    const result = await searchNearbyPlaces("golf course", PORTLAND, {
      apiKey: "bad-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("error");
      expect(result.message).toContain("403");
    }
  });

  it("returns an error result instead of throwing when fetch itself rejects", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await searchNearbyPlaces("golf course", PORTLAND, {
      apiKey: "fake-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toBe("error");
      expect(result.message).toBe("network down");
    }
  });
});
