// Retailer deep links (Section 7.5). No retailer API integration — see the
// "autopilot ceiling" in Section 7.6: curated options + a deep link is the
// whole product, never an automated purchase. Pure string building, no
// network calls, no headless browser.
export interface RetailerLink {
  retailer: string;
  url: string;
}

export function buildAmazonSearchLink(title: string): RetailerLink {
  return {
    retailer: "Amazon",
    url: `https://www.amazon.com/s?k=${encodeURIComponent(title)}`,
  };
}

export function buildWebSearchFallbackUrl(title: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`${title} buy`)}`;
}
