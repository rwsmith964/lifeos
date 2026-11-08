import { describe, expect, it } from "vitest";
import {
  buildAmazonSearchLink,
  buildPreferredSiteSearchLink,
  buildWebSearchFallbackUrl,
  isGenericWebSearchUrl,
} from "./retailer-links";

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
  it("restricts the Google search to the saved site's domain when the domain has no known direct search template", () => {
    const link = buildPreferredSiteSearchLink(
      { label: "Fat Brain Toys", url: "https://www.fatbraintoys.com/shop/somefavorite" },
      "wool scarf"
    );
    expect(link.retailer).toBe("Fat Brain Toys");
    expect(link.url).toBe("https://www.google.com/search?q=wool%20scarf%20site%3Afatbraintoys.com");
  });

  it("strips a leading www. before matching the domain against the site: fallback", () => {
    const link = buildPreferredSiteSearchLink({ label: "Some Boutique", url: "https://www.someboutique.com" }, "toy truck");
    expect(link.url).toContain("site%3Asomeboutique.com");
  });

  it("falls back to a plain query when the saved URL can't be parsed", () => {
    const link = buildPreferredSiteSearchLink({ label: "Weird Site", url: "not a real url" }, "gift idea");
    expect(link.retailer).toBe("Weird Site");
    expect(link.url).toBe("https://www.google.com/search?q=gift%20idea");
  });

  // P-07: known retailers get their own real search URL instead of the
  // google.com `site:` workaround, so "Search on Etsy" actually searches
  // Etsy rather than silently searching Google.
  it("uses Etsy's own search URL for an etsy.com site", () => {
    const link = buildPreferredSiteSearchLink({ label: "Etsy", url: "https://www.etsy.com/shop/somefavorite" }, "wool scarf");
    expect(link.url).toBe("https://www.etsy.com/search?q=wool%20scarf");
  });

  it("uses Target's own search URL for a target.com site, www. stripped", () => {
    const link = buildPreferredSiteSearchLink({ label: "Target", url: "https://www.target.com" }, "toy truck");
    expect(link.url).toBe("https://www.target.com/s?searchTerm=toy%20truck");
  });
});

describe("isGenericWebSearchUrl (P-07)", () => {
  it("is true for the google.com site: fallback", () => {
    expect(isGenericWebSearchUrl("https://www.google.com/search?q=wool+scarf+site%3Afatbraintoys.com")).toBe(true);
  });

  it("is false for a known retailer's own direct search URL", () => {
    expect(isGenericWebSearchUrl("https://www.etsy.com/search?q=wool%20scarf")).toBe(false);
  });

  it("is false for Amazon's search URL", () => {
    expect(isGenericWebSearchUrl("https://www.amazon.com/s?k=LEGO")).toBe(false);
  });

  it("is false for an unparseable URL rather than throwing", () => {
    expect(isGenericWebSearchUrl("not a real url")).toBe(false);
  });
});
