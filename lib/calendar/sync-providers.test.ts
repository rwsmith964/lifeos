import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarSyncAccountRow } from "../db/database.types";
import { encryptSecret } from "../security/encryption";

vi.mock("./caldav", () => ({
  listCalendarResources: vi.fn(),
  getCalendarResource: vi.fn(),
  putCalendarResource: vi.fn(),
  deleteCalendarResource: vi.fn(),
}));

import * as caldav from "./caldav";
import { adapterForAccount, caldavAdapter, googleAdapter, ProviderNotReadyError } from "./sync-providers";

const TEST_KEY = Buffer.from("0123456789abcdef0123456789abcdef").subarray(0, 32).toString("base64");

// encryptSecret (used by withCaldavCreds below) needs a real key configured
// for every describe block in this file, not just the one that exercises
// network calls directly.
const originalEncryptionKey = process.env.CALDAV_ENCRYPTION_KEY;
beforeEach(() => {
  process.env.CALDAV_ENCRYPTION_KEY = TEST_KEY;
});
afterEach(() => {
  if (originalEncryptionKey == null) delete process.env.CALDAV_ENCRYPTION_KEY;
  else process.env.CALDAV_ENCRYPTION_KEY = originalEncryptionKey;
});

function baseAccount(overrides: Partial<CalendarSyncAccountRow> = {}): CalendarSyncAccountRow {
  return {
    id: "account-1",
    household_id: "household-1",
    created_by_person_id: "person-1",
    provider: "apple_icloud",
    label: "iCloud",
    caldav_server_url: null,
    caldav_username: null,
    caldav_app_password_ciphertext: null,
    caldav_app_password_iv: null,
    caldav_app_password_auth_tag: null,
    caldav_calendar_href: null,
    oauth_access_token_ciphertext: null,
    oauth_refresh_token_ciphertext: null,
    oauth_token_expires_at: null,
    sync_direction: "two_way",
    last_pull_at: null,
    last_pull_status: "never",
    last_pull_error: null,
    last_push_at: null,
    last_push_status: "never",
    last_push_error: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function withCaldavCreds(overrides: Partial<CalendarSyncAccountRow> = {}): CalendarSyncAccountRow {
  const enc = encryptSecret("app-specific-password");
  return baseAccount({
    caldav_server_url: "https://caldav.icloud.com/1234/calendars/home/",
    caldav_username: "richard@example.com",
    caldav_app_password_ciphertext: enc.ciphertext,
    caldav_app_password_iv: enc.iv,
    caldav_app_password_auth_tag: enc.authTag,
    ...overrides,
  });
}

describe("adapterForAccount", () => {
  it("routes apple_icloud and outlook_caldav to the CalDAV adapter", () => {
    expect(adapterForAccount(baseAccount({ provider: "apple_icloud" }))).toBe(caldavAdapter);
    expect(adapterForAccount(baseAccount({ provider: "outlook_caldav" }))).toBe(caldavAdapter);
  });

  it("routes google to the (unimplemented) google adapter", () => {
    expect(adapterForAccount(baseAccount({ provider: "google" }))).toBe(googleAdapter);
  });
});

describe("caldavAdapter.isReady", () => {
  it("is false when no credentials are set", () => {
    expect(caldavAdapter.isReady(baseAccount())).toBe(false);
  });

  it("is false for an unsafe (private/loopback) server URL even with credentials present", () => {
    expect(
      caldavAdapter.isReady(withCaldavCreds({ caldav_server_url: "http://localhost/calendars/home/" }))
    ).toBe(false);
  });

  it("is true with a real server URL, username, and encrypted password", () => {
    expect(caldavAdapter.isReady(withCaldavCreds())).toBe(true);
  });
});

describe("googleAdapter.isReady", () => {
  const originalId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const originalSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;

  afterEach(() => {
    if (originalId == null) delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
    else process.env.GOOGLE_CALENDAR_CLIENT_ID = originalId;
    if (originalSecret == null) delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
    else process.env.GOOGLE_CALENDAR_CLIENT_SECRET = originalSecret;
  });

  it("is false without GOOGLE_CALENDAR_CLIENT_ID/SECRET configured (QUEUE-015)", () => {
    delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
    delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
    expect(googleAdapter.isReady(baseAccount({ provider: "google" }))).toBe(false);
  });

  it("rejects any call with ProviderNotReadyError", async () => {
    await expect(googleAdapter.listRemoteEvents(baseAccount({ provider: "google" }))).rejects.toBeInstanceOf(
      ProviderNotReadyError
    );
  });
});

describe("caldavAdapter network calls", () => {
  beforeEach(() => {
    vi.mocked(caldav.listCalendarResources).mockReset();
    vi.mocked(caldav.getCalendarResource).mockReset();
    vi.mocked(caldav.putCalendarResource).mockReset();
    vi.mocked(caldav.deleteCalendarResource).mockReset();
  });

  it("decrypts the app password and passes plain-text CalDAV credentials through to listCalendarResources", async () => {
    vi.mocked(caldav.listCalendarResources).mockResolvedValue([{ href: "/e1.ics", etag: '"1"' }]);
    vi.mocked(caldav.getCalendarResource).mockResolvedValue({ href: "/e1.ics", etag: '"1"', icsText: "BEGIN:VCALENDAR\nEND:VCALENDAR" });

    const account = withCaldavCreds();
    const events = await caldavAdapter.listRemoteEvents(account);

    expect(events).toHaveLength(1);
    const passedCreds = vi.mocked(caldav.listCalendarResources).mock.calls[0][0];
    expect(passedCreds).toEqual({
      serverUrl: account.caldav_server_url,
      username: account.caldav_username,
      appPassword: "app-specific-password",
    });
  });

  it("throws ProviderNotReadyError instead of calling the network when credentials are incomplete", async () => {
    await expect(caldavAdapter.listRemoteEvents(baseAccount())).rejects.toBeInstanceOf(ProviderNotReadyError);
    expect(caldav.listCalendarResources).not.toHaveBeenCalled();
  });

  it("passes existing href/etag through to putCalendarResource for an update push", async () => {
    vi.mocked(caldav.putCalendarResource).mockResolvedValue({ href: "/e1.ics", etag: '"2"' });
    const account = withCaldavCreds();
    await caldavAdapter.pushEvent(account, "BEGIN:VCALENDAR\nEND:VCALENDAR", { href: "/e1.ics", etag: '"1"' });
    expect(caldav.putCalendarResource).toHaveBeenCalledWith(
      expect.objectContaining({ username: account.caldav_username }),
      "BEGIN:VCALENDAR\nEND:VCALENDAR",
      { existingHref: "/e1.ics", existingEtag: '"1"' }
    );
  });
});
