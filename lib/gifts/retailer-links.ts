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

/**
 * D-063: a link into one of a person's saved preferred gift sites
 * (person_gift_sites). Every saved site's own internal search URL syntax
 * is unknown and varies wildly (Etsy, Target, a small boutique's Shopify
 * store, etc.) -- rather than guess or maintain a per-domain adapter list,
 * this uses a Google search restricted to that site's domain via
 * `site:`, which works uniformly for any URL the user saves. Not a
 * network call -- pure string building, same "autopilot ceiling" as
 * buildAmazonSearchLink (Section 7.5/7.6): a curated deep link, never an
 * automated purchase.
 */
export function buildPreferredSiteSearchLink(site: { label: string; url: string }, title: string): RetailerLink {
  const domain = extractDomain(site.url);
  const query = domain ? `${title} site:${domain}` : title;
  return {
    retailer: site.label,
    url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
  };
}

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
