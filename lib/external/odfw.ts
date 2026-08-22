// ODFW recreation report adapter (Section 9.3 — "the ODFW problem"). Oregon
// Fish & Wildlife publishes recreation reports as web pages, not an API.
// Per the spec: fetch a small, explicit set of zone report URLs, at most
// once daily, cached, with a clearly identified User-Agent, and graceful
// degradation if the page structure changes. No aggressive scraping, no
// attempt at rich structured parsing of a page that could change shape any
// time — this extracts plain text and hands it to the weekend planner
// as-is; if the fetch fails, the planner says "no current fishing report
// available" and never guesses (Section 9.3, 9.6).
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrFetchCached } from "./cache";

const ODFW_USER_AGENT =
  process.env.ODFW_USER_AGENT ?? "LifeOS/1.0 (personal recreation planning app; self-hosted, single user)";
const CACHE_TTL_SECONDS = 24 * 60 * 60; // "at most once daily"
const MAX_REPORT_TEXT_LENGTH = 4000;

export interface OdfwReportData {
  zoneUrl: string;
  reportText: string;
}

export interface OdfwReportOutcome {
  source: "odfw";
  available: boolean;
  data: OdfwReportData | null;
  fetchedAt: string | null;
  fromCache: boolean;
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchOdfwReport(zoneUrl: string, fetchImpl: typeof fetch): Promise<OdfwReportData> {
  const res = await fetchImpl(zoneUrl, { headers: { "User-Agent": ODFW_USER_AGENT } });
  if (!res.ok) throw new Error(`ODFW report fetch failed: HTTP ${res.status}`);
  const html = await res.text();
  const text = stripHtmlToText(html).slice(0, MAX_REPORT_TEXT_LENGTH);
  if (text.length === 0) throw new Error("ODFW report page returned no extractable text (structure may have changed)");
  return { zoneUrl, reportText: text };
}

/**
 * `zoneUrl` is one of a small, explicitly-configured set of ODFW zone
 * report pages — never construct or discover URLs dynamically.
 */
export async function getOdfwReport(
  client: SupabaseClient,
  zoneUrl: string,
  options: { fetchImpl?: typeof fetch } = {}
): Promise<OdfwReportOutcome> {
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const cached = await getOrFetchCached(client, "odfw", zoneUrl, CACHE_TTL_SECONDS, () =>
      fetchOdfwReport(zoneUrl, fetchImpl)
    );
    return { source: "odfw", available: true, data: cached.data, fetchedAt: cached.fetchedAt, fromCache: cached.fromCache };
  } catch (error) {
    console.error(`[odfw] report unavailable for ${zoneUrl}: ${error}`);
    return { source: "odfw", available: false, data: null, fetchedAt: null, fromCache: false };
  }
}
