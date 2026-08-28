import { describe, expect, it } from "vitest";
import { buildAmazonSearchLink, buildPreferredSiteSearchLink, buildWebSearchFallbackUrl } from "./retailer-links";

describe("buildAmazonSearchLink", () => {
  it("URL-encodes the title into an Amazon search query", () => {
    const link = buildAmazonSearchLink("LEGO Star Wars set");
    expect(link.retailer).toBe("Amazon");
    expect(link.url).toBe("https://www.amazon.com/s?k=LEGO%20Star%20Wars%20set");
  });
});

describe("buildWebSearchFallbackUrl", () => {
  it("builds a generic Google search URL appending 'buy'", () => {
    const url = buildWebSearchFallbackUrl("fishing rod");
    expect(url).toBe("https://www.google.com/search?q=fishing%20rod%20buy");
  });
});

describe("buildPreferredSiteSearchLink", () => {
  it("restricts the Google search to the saved site's domain", () => {
    const link = buildPreferredSiteSearchLink({ label: "Etsy", url: "https://www.etsy.com/shop/somefavorite" }, "wool scarf");
    expect(link.retailer).toBe("Etsy");
    expect(link.url).toBe("https://www.google.com/search?q=wool%20scarf%20site%3Aetsy.com");
  });

  it("strips a leading www. before using the domain", () => {
    const link = buildPreferredSiteSearchLink({ label: "Target", url: "https://www.target.com" }, "toy truck");
    expect(link.url).toContain("site%3Atarget.com");
  });

  it("falls back to a plain query when the saved URL can't be parsed", () => {
    const link = buildPreferredSiteSearchLink({ label: "Weird Site", url: "not a real url" }, "gift idea");
    expect(link.retailer).toBe("Weird Site");
    expect(link.url).toBe("https://www.google.com/search?q=gift%20idea");
  });
});
