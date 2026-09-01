// Module 4 — minimal generic CalDAV client for Apple iCloud and Outlook.com
// two-way sync. No XML library exists in this repo (see
// inventory-module4.md Part D) and CalDAV's actual traffic is small and
// structurally simple (PROPFIND returns a flat list of <D:response> blocks,
// each with one <D:href> and one <D:getetag>) -- a full XML parser would be
// a large new dependency for a handful of fixed shapes, so this module
// extracts them with targeted regexes instead, same "just enough to be
// correct for the real traffic" posture as ics-import.ts's use of node-ical
// rather than a hand-rolled RFC 5545 parser (which reuses a library because
// RRULE expansion is genuinely complex; this is the inverse case, where a
// dependency would be overkill for what's actually a few tag extractions).
// Auth is HTTP Basic (username + app-specific password) -- the standard
// CalDAV auth for both Apple iCloud and Outlook.com/Microsoft 365 personal
// calendars when OAuth isn't set up, matching what QUEUE-015 already
// settled on for why Google (which has no app-password option) is stubbed
// instead of wired.
import { randomUUID } from "node:crypto";

export interface CalDavCredentials {
  serverUrl: string;
  username: string;
  appPassword: string;
}

export interface CalDavResourceRef {
  href: string;
  etag: string | null;
}

export interface CalDavIcsResource extends CalDavResourceRef {
  icsText: string;
}

export const CALDAV_FETCH_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // one household's calendar; generous but bounded

export class CalDavRequestError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "CalDavRequestError";
  }
}

function basicAuthHeader(creds: CalDavCredentials): string {
  return `Basic ${Buffer.from(`${creds.username}:${creds.appPassword}`).toString("base64")}`;
}

function resolveHref(serverUrl: string, href: string): string {
  try {
    return new URL(href, serverUrl).toString();
  } catch {
    return href;
  }
}

async function caldavFetch(
  url: string,
  creds: CalDavCredentials,
  init: { method: string; headers?: Record<string, string>; body?: string },
  fetchImpl: typeof fetch
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CALDAV_FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: init.method,
      signal: controller.signal,
      headers: {
        Authorization: basicAuthHeader(creds),
        ...init.headers,
      },
      body: init.body,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

/** Every CalDAV call accepts an injectable `fetchImpl` — same testability pattern as lib/external/travel.ts and geocode.ts. */
export interface CalDavCallOptions {
  fetchImpl?: typeof fetch;
}

/**
 * PROPFIND Depth:1 against the calendar collection URL, returning every
 * event resource's href + etag. This is the CalDAV "list what's in this
 * calendar" call — the multistatus response has one <D:response> per
 * resource; VEVENT-only collections (a real calendar) don't need a
 * calendar-data filter to get just the refs, so this deliberately asks for
 * the cheap propfind rather than a REPORT with expanded calendar-data.
 */
export async function listCalendarResources(
  creds: CalDavCredentials,
  options: CalDavCallOptions = {}
): Promise<CalDavResourceRef[]> {
  const body =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<D:propfind xmlns:D="DAV:"><D:prop><D:getetag/></D:prop></D:propfind>';

  const response = await caldavFetch(
    creds.serverUrl,
    creds,
    { method: "PROPFIND", headers: { Depth: "1", "Content-Type": "application/xml; charset=utf-8" }, body },
    options.fetchImpl ?? fetch
  );

  if (response.status !== 207 && !response.ok) {
    throw new CalDavRequestError(`PROPFIND failed with HTTP ${response.status}`, response.status);
  }

  const xml = await readBoundedText(response);
  return parseMultistatusRefs(xml, creds.serverUrl);
}

/** Fetches one resource's raw ICS body plus its current etag (for later conditional PUT). */
export async function getCalendarResource(
  creds: CalDavCredentials,
  ref: CalDavResourceRef,
  options: CalDavCallOptions = {}
): Promise<CalDavIcsResource> {
  const url = resolveHref(creds.serverUrl, ref.href);
  const response = await caldavFetch(url, creds, { method: "GET" }, options.fetchImpl ?? fetch);
  if (!response.ok) {
    throw new CalDavRequestError(`GET ${ref.href} failed with HTTP ${response.status}`, response.status);
  }
  const icsText = await readBoundedText(response);
  const etag = response.headers.get("etag") ?? ref.etag;
  return { href: ref.href, etag, icsText };
}

/**
 * Creates (no `existingHref`) or updates (with `existingHref`, sent
 * If-Match against the last known etag to avoid silently clobbering a
 * remote edit) one event resource. Returns the resource's new href/etag so
 * the caller can persist round-trip identity on the local event row.
 */
export async function putCalendarResource(
  creds: CalDavCredentials,
  icsText: string,
  options: {
    existingHref?: string;
    existingEtag?: string | null;
    newResourceName?: string;
  } & CalDavCallOptions = {}
): Promise<CalDavResourceRef> {
  const href = options.existingHref ?? `${options.newResourceName ?? randomUUID()}.ics`;
  const url = resolveHref(creds.serverUrl, href);

  const headers: Record<string, string> = { "Content-Type": "text/calendar; charset=utf-8" };
  if (options.existingHref) {
    headers["If-Match"] = options.existingEtag ?? "*";
  } else {
    headers["If-None-Match"] = "*";
  }

  const response = await caldavFetch(url, creds, { method: "PUT", headers, body: icsText }, options.fetchImpl ?? fetch);
  if (!response.ok) {
    throw new CalDavRequestError(`PUT ${href} failed with HTTP ${response.status}`, response.status);
  }
  const etag = response.headers.get("etag") ?? null;
  return { href, etag };
}

export async function deleteCalendarResource(
  creds: CalDavCredentials,
  ref: CalDavResourceRef,
  options: CalDavCallOptions = {}
): Promise<void> {
  const url = resolveHref(creds.serverUrl, ref.href);
  const headers: Record<string, string> = {};
  if (ref.etag) headers["If-Match"] = ref.etag;
  const response = await caldavFetch(url, creds, { method: "DELETE", headers }, options.fetchImpl ?? fetch);
  // A 404 here means the remote side already deleted it independently —
  // that's the desired end state, not a failure, so it's treated as success.
  if (!response.ok && response.status !== 404) {
    throw new CalDavRequestError(`DELETE ${ref.href} failed with HTTP ${response.status}`, response.status);
  }
}

async function readBoundedText(response: Response): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
    throw new CalDavRequestError("CalDAV response exceeded the size limit.");
  }
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new CalDavRequestError("CalDAV response exceeded the size limit.");
  }
  return text;
}

/**
 * Regex-based multistatus extraction (see module comment for why no XML
 * library). Handles both `<D:href>`/`<d:href>` namespace-prefixed forms
 * and unprefixed `<href>`, which real-world CalDAV servers mix
 * inconsistently across Apple/Microsoft/generic implementations.
 */
// serverUrl is accepted (and passed by every call site) for future use --
// resolving relative href values against the server's base URL if a CalDAV
// server ever returns an absolute href in one response and a relative one
// in another within the same multistatus body. Not currently needed since
// every href seen from Apple/Outlook so far is already collection-relative,
// so it's intentionally unused for now rather than removed from the
// signature (removing it would be a breaking, not additive, API change for
// no functional gain).
export function parseMultistatusRefs(xml: string, _serverUrl: string): CalDavResourceRef[] {
  const refs: CalDavResourceRef[] = [];
  const responseBlocks = xml.match(/<[^:>]*:?response[^>]*>[\s\S]*?<\/[^:>]*:?response>/gi) ?? [];

  for (const block of responseBlocks) {
    const hrefMatch = block.match(/<[^:>]*:?href[^>]*>([\s\S]*?)<\/[^:>]*:?href>/i);
    if (!hrefMatch) continue;
    const href = decodeXmlEntities(hrefMatch[1].trim());
    // Skip the calendar collection's own entry (a PROPFIND Depth:1 always
    // includes the collection itself as the first response) -- a real
    // event resource path ends in .ics, the collection href never does.
    if (!href.toLowerCase().endsWith(".ics")) continue;

    const etagMatch = block.match(/<[^:>]*:?getetag[^>]*>([\s\S]*?)<\/[^:>]*:?getetag>/i);
    const etag = etagMatch ? decodeXmlEntities(etagMatch[1].trim()) : null;
    refs.push({ href, etag });
  }

  return refs;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
