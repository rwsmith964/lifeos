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

// P-07 (audit pass 2026-09-11): "'Search on Fat Brain Toys' resolves to
// google.com/search?q=...+site:fatbraintoys.com." The button claimed to
// search the retailer's own site but was silently a Google search the
// whole time -- for the small set of retailers common enough to have a
// well-known, stable search URL, use their real one instead of the
// `site:` workaround below.
const KNOWN_RETAILER_SEARCH_TEMPLATES: Record<string, (query: string) => string> = {
  "amazon.com": (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}`,
  "etsy.com": (q) => `https://www.etsy.com/search?q=${encodeURIComponent(q)}`,
  "target.com": (q) => `https://www.target.com/s?searchTerm=${encodeURIComponent(q)}`,
  "walmart.com": (q) => `https://www.walmart.com/search?q=${encodeURIComponent(q)}`,
};

/**
 * D-063: a link into one of a person's saved preferred gift sites
 * (person_gift_sites). Most saved sites are small boutiques with no known,
 * stable search URL of their own -- rather than guess or maintain an
 * exhaustive per-domain adapter list, this falls back to a Google search
 * restricted to that site's domain via `site:`, which works uniformly for
 * any URL the user saves. Not a network call -- pure string building, same
 * "autopilot ceiling" as buildAmazonSearchLink (Section 7.5/7.6): a
 * curated deep link, never an automated purchase.
 */
export function buildPreferredSiteSearchLink(site: { label: string; url: string }, title: string): RetailerLink {
  const domain = extractDomain(site.url);
  const template = domain ? KNOWN_RETAILER_SEARCH_TEMPLATES[domain] : undefined;
  if (template) {
    return { retailer: site.label, url: template(title) };
  }
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

/**
 * P-07: whether a stored suggestion link is a generic web search (the
 * `site:`-restricted Google fallback above) rather than a retailer's own
 * search page -- used purely to pick honest button copy at render time
 * ("Search the web for ..." vs. "Search on ..."), without needing a schema
 * change to persist which kind of link this was when it was generated.
 */
export function isGenericWebSearchUrl(url: string): boolean {
  try {
    return new URL(url).hostname.replace(/^www\./, "") === "google.com";
  } catch {
    return false;
  }
}
