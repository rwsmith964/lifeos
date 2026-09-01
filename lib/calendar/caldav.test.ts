import { describe, expect, it, vi } from "vitest";
import {
  deleteCalendarResource,
  getCalendarResource,
  listCalendarResources,
  parseMultistatusRefs,
  putCalendarResource,
  type CalDavCredentials,
} from "./caldav";

const creds: CalDavCredentials = {
  serverUrl: "https://caldav.example.com/calendars/richard/home/",
  username: "richard@example.com",
  appPassword: "app-specific-password",
};

function fakeResponse(overrides: Partial<Response> & { textBody?: string } = {}): Response {
  const headers = new Map<string, string>(Object.entries((overrides as unknown as { headerEntries?: Record<string, string> }).headerEntries ?? {}));
  return {
    ok: overrides.ok ?? true,
    status: overrides.status ?? 200,
    headers: { get: (key: string) => headers.get(key.toLowerCase()) ?? null } as unknown as Headers,
    text: async () => overrides.textBody ?? "",
  } as unknown as Response;
}

describe("parseMultistatusRefs", () => {
  it("extracts href + etag pairs and skips the collection's own entry", () => {
    const xml = `<?xml version="1.0"?>
      <D:multistatus xmlns:D="DAV:">
        <D:response>
          <D:href>/calendars/richard/home/</D:href>
          <D:propstat><D:prop><D:getetag>"collection-etag"</D:getetag></D:prop></D:propstat>
        </D:response>
        <D:response>
          <D:href>/calendars/richard/home/event-1.ics</D:href>
          <D:propstat><D:prop><D:getetag>"etag-1"</D:getetag></D:prop></D:propstat>
        </D:response>
        <D:response>
          <D:href>/calendars/richard/home/event-2.ics</D:href>
          <D:propstat><D:prop><D:getetag>"etag-2"</D:getetag></D:prop></D:propstat>
        </D:response>
      </D:multistatus>`;

    const refs = parseMultistatusRefs(xml, creds.serverUrl);

    expect(refs).toEqual([
      { href: "/calendars/richard/home/event-1.ics", etag: '"etag-1"' },
      { href: "/calendars/richard/home/event-2.ics", etag: '"etag-2"' },
    ]);
  });

  it("handles unprefixed href/getetag tags (some servers omit the D: namespace prefix)", () => {
    const xml = `<multistatus xmlns="DAV:">
      <response><href>/cal/a.ics</href><propstat><prop><getetag>"a"</getetag></prop></propstat></response>
    </multistatus>`;
    expect(parseMultistatusRefs(xml, creds.serverUrl)).toEqual([{ href: "/cal/a.ics", etag: '"a"' }]);
  });

  it("returns an empty array for an empty collection", () => {
    const xml = `<D:multistatus xmlns:D="DAV:">
      <D:response><D:href>/calendars/richard/home/</D:href></D:response>
    </D:multistatus>`;
    expect(parseMultistatusRefs(xml, creds.serverUrl)).toEqual([]);
  });

  it("decodes XML entities in hrefs (spaces/special characters get percent- or entity-encoded by some servers)", () => {
    const xml = `<D:multistatus xmlns:D="DAV:">
      <D:response><D:href>/cal/a&amp;b.ics</D:href><D:propstat><D:prop><D:getetag>"x"</D:getetag></D:prop></D:propstat></D:response>
    </D:multistatus>`;
    expect(parseMultistatusRefs(xml, creds.serverUrl)).toEqual([{ href: "/cal/a&b.ics", etag: '"x"' }]);
  });
});

describe("listCalendarResources", () => {
  it("sends a PROPFIND with Depth:1 and Basic auth, returning parsed refs", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeResponse({
        status: 207,
        textBody: `<D:multistatus xmlns:D="DAV:"><D:response><D:href>/cal/e1.ics</D:href><D:propstat><D:prop><D:getetag>"1"</D:getetag></D:prop></D:propstat></D:response></D:multistatus>`,
      })
    );

    const refs = await listCalendarResources(creds, { fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(refs).toEqual([{ href: "/cal/e1.ics", etag: '"1"' }]);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(creds.serverUrl);
    expect(init.method).toBe("PROPFIND");
    expect(init.headers.Depth).toBe("1");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from(`${creds.username}:${creds.appPassword}`).toString("base64")}`);
  });

  it("throws CalDavRequestError on a non-2xx/207 response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ ok: false, status: 401 }));
    await expect(
      listCalendarResources(creds, { fetchImpl: fetchImpl as unknown as typeof fetch })
    ).rejects.toMatchObject({ name: "CalDavRequestError", status: 401 });
  });
});

describe("getCalendarResource", () => {
  it("fetches the ICS body and prefers the response's own etag header over the passed-in ref", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeResponse({ textBody: "BEGIN:VCALENDAR\nEND:VCALENDAR", headerEntries: { etag: '"fresh"' } } as never)
    );
    const result = await getCalendarResource(
      creds,
      { href: "/cal/e1.ics", etag: '"stale"' },
      { fetchImpl: fetchImpl as unknown as typeof fetch }
    );
    expect(result.icsText).toContain("VCALENDAR");
    expect(result.etag).toBe('"fresh"');
  });
});

describe("putCalendarResource", () => {
  it("creates a new resource with If-None-Match when no existingHref is given", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ headerEntries: { etag: '"new"' } } as never));
    const result = await putCalendarResource(creds, "BEGIN:VCALENDAR\nEND:VCALENDAR", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.method).toBe("PUT");
    expect(init.headers["If-None-Match"]).toBe("*");
    expect(result.href).toMatch(/\.ics$/);
    expect(result.etag).toBe('"new"');
  });

  it("updates an existing resource with If-Match against the known etag", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ headerEntries: { etag: '"v2"' } } as never));
    const result = await putCalendarResource(creds, "BEGIN:VCALENDAR\nEND:VCALENDAR", {
      existingHref: "/cal/e1.ics",
      existingEtag: '"v1"',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers["If-Match"]).toBe('"v1"');
    expect(result.href).toBe("/cal/e1.ics");
    expect(result.etag).toBe('"v2"');
  });
});

describe("deleteCalendarResource", () => {
  it("treats a 404 as success (already gone remotely)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ ok: false, status: 404 }));
    await expect(
      deleteCalendarResource(creds, { href: "/cal/e1.ics", etag: null }, { fetchImpl: fetchImpl as unknown as typeof fetch })
    ).resolves.toBeUndefined();
  });

  it("throws on a real failure status", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ ok: false, status: 500 }));
    await expect(
      deleteCalendarResource(creds, { href: "/cal/e1.ics", etag: null }, { fetchImpl: fetchImpl as unknown as typeof fetch })
    ).rejects.toMatchObject({ name: "CalDavRequestError", status: 500 });
  });
});
