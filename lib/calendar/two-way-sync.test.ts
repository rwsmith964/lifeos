import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabaseClient, type FakeCall } from "../test-support/fake-supabase";
import type { CalendarSyncAccountRow } from "../db/database.types";
import { pullFromSyncAccount, pushToSyncAccount } from "./two-way-sync";

vi.mock("./sync-providers", () => ({
  adapterForAccount: vi.fn(),
  ProviderNotReadyError: class ProviderNotReadyError extends Error {},
}));

// Import the mocked module to control its return value per test.
import { adapterForAccount } from "./sync-providers";

function baseAccount(overrides: Partial<CalendarSyncAccountRow> = {}): CalendarSyncAccountRow {
  return {
    id: "account-1",
    household_id: "household-1",
    created_by_person_id: "person-1",
    provider: "apple_icloud",
    label: "Richard's iCloud",
    caldav_server_url: "https://caldav.icloud.com/1234/calendars/home/",
    caldav_username: "richard@example.com",
    caldav_app_password_ciphertext: "ct",
    caldav_app_password_iv: "iv",
    caldav_app_password_auth_tag: "tag",
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

const SAMPLE_ICS =
  "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:abc-123\r\nDTSTART:20260915T170000Z\r\nDTEND:20260915T180000Z\r\nSUMMARY:Dentist\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";

beforeEach(() => {
  vi.mocked(adapterForAccount).mockReset();
});

describe("pullFromSyncAccount", () => {
  it("imports remote events not already tracked as a locally-pushed event", async () => {
    const adapter = {
      provider: "apple_icloud" as const,
      isReady: vi.fn().mockReturnValue(true),
      listRemoteEvents: vi.fn().mockResolvedValue([{ href: "/cal/e1.ics", etag: '"1"', icsText: SAMPLE_ICS }]),
      pushEvent: vi.fn(),
      deleteRemoteEvent: vi.fn(),
    };
    vi.mocked(adapterForAccount).mockReturnValue(adapter);

    const { client, calls } = createFakeSupabaseClient({
      calendar_events: { rows: [] }, // listEventsSyncedToAccount -> no prior pushes
      calendar_sync_accounts: {},
    });

    const result = await pullFromSyncAccount(client as never, baseAccount());

    expect(result).toEqual({ ok: true, count: 1, error: null, skipped: false });
    const insertCall = calls.find((c: FakeCall) => c.table === "calendar_events" && c.op === "insert");
    expect(insertCall).toBeTruthy();
    const inserted = insertCall!.values as unknown as Array<{ title: string; external_source: string }>;
    expect(inserted[0].title).toBe("Dentist");
    expect(inserted[0].external_source).toBe("caldav:account-1");

    const accountUpdate = calls.find((c: FakeCall) => c.table === "calendar_sync_accounts" && c.op === "update");
    expect((accountUpdate!.values as { last_pull_status: string }).last_pull_status).toBe("ok");
  });

  it("skips a remote resource whose href matches an event we ourselves already pushed", async () => {
    const adapter = {
      provider: "apple_icloud" as const,
      isReady: vi.fn().mockReturnValue(true),
      listRemoteEvents: vi.fn().mockResolvedValue([{ href: "/cal/e1.ics", etag: '"1"', icsText: SAMPLE_ICS }]),
      pushEvent: vi.fn(),
      deleteRemoteEvent: vi.fn(),
    };
    vi.mocked(adapterForAccount).mockReturnValue(adapter);

    const { client, calls } = createFakeSupabaseClient({
      calendar_events: { rows: [{ id: "evt-native", external_caldav_href: "/cal/e1.ics" }] },
      calendar_sync_accounts: {},
    });

    const result = await pullFromSyncAccount(client as never, baseAccount());

    expect(result.ok).toBe(true);
    expect(result.count).toBe(0); // the only remote event was our own pushed copy -- correctly not re-imported
    const insertCall = calls.find((c: FakeCall) => c.table === "calendar_events" && c.op === "insert");
    expect(insertCall).toBeUndefined();
  });

  it("skips google accounts as unimplemented rather than recording a failure", async () => {
    const adapter = {
      provider: "google" as const,
      isReady: vi.fn().mockReturnValue(false),
      listRemoteEvents: vi.fn(),
      pushEvent: vi.fn(),
      deleteRemoteEvent: vi.fn(),
    };
    vi.mocked(adapterForAccount).mockReturnValue(adapter);

    const { client, calls } = createFakeSupabaseClient({});
    const result = await pullFromSyncAccount(client as never, baseAccount({ provider: "google" }));

    expect(result).toEqual({ ok: true, count: 0, error: null, skipped: true });
    expect(calls.find((c: FakeCall) => c.table === "calendar_sync_accounts" && c.op === "update")).toBeUndefined();
  });

  it("records a pull failure when the remote fetch throws", async () => {
    const adapter = {
      provider: "apple_icloud" as const,
      isReady: vi.fn().mockReturnValue(true),
      listRemoteEvents: vi.fn().mockRejectedValue(new Error("HTTP 401")),
      pushEvent: vi.fn(),
      deleteRemoteEvent: vi.fn(),
    };
    vi.mocked(adapterForAccount).mockReturnValue(adapter);

    const { client, calls } = createFakeSupabaseClient({ calendar_sync_accounts: {} });
    const result = await pullFromSyncAccount(client as never, baseAccount());

    expect(result.ok).toBe(false);
    expect(result.error).toContain("401");
    const accountUpdate = calls.find((c: FakeCall) => c.table === "calendar_sync_accounts" && c.op === "update");
    expect((accountUpdate!.values as { last_pull_status: string }).last_pull_status).toBe("error");
  });
});

describe("pushToSyncAccount", () => {
  it("is a no-op for a pull_only account", async () => {
    const { client } = createFakeSupabaseClient({});
    const result = await pushToSyncAccount(client as never, baseAccount({ sync_direction: "pull_only" }));
    expect(result).toEqual({ ok: true, count: 0, error: null, skipped: true });
    expect(adapterForAccount).not.toHaveBeenCalled();
  });

  it("pushes unsynced local events and records round-trip identity on each", async () => {
    const adapter = {
      provider: "apple_icloud" as const,
      isReady: vi.fn().mockReturnValue(true),
      listRemoteEvents: vi.fn(),
      pushEvent: vi.fn().mockResolvedValue({ href: "/cal/new-1.ics", etag: '"e1"' }),
      deleteRemoteEvent: vi.fn(),
    };
    vi.mocked(adapterForAccount).mockReturnValue(adapter);

    const localEvent = {
      id: "evt-1",
      title: "Piano lesson",
      description: null,
      location: null,
      starts_at: "2026-09-10T20:00:00.000Z",
      ends_at: "2026-09-10T21:00:00.000Z",
      all_day: false,
    };

    const { client, calls } = createFakeSupabaseClient({
      calendar_events: { rows: [localEvent] },
      calendar_sync_accounts: {},
    });

    const result = await pushToSyncAccount(client as never, baseAccount());

    expect(result).toEqual({ ok: true, count: 1, error: null, skipped: false });
    expect(adapter.pushEvent).toHaveBeenCalledTimes(1);

    const eventUpdate = calls.find((c: FakeCall) => c.table === "calendar_events" && c.op === "update");
    expect(eventUpdate!.values).toMatchObject({
      synced_to_account_id: "account-1",
      external_caldav_href: "/cal/new-1.ics",
      external_caldav_etag: '"e1"',
    });
  });

  it("isolates one event's push failure from the rest and still records how many succeeded", async () => {
    const adapter = {
      provider: "apple_icloud" as const,
      isReady: vi.fn().mockReturnValue(true),
      listRemoteEvents: vi.fn(),
      pushEvent: vi
        .fn()
        .mockRejectedValueOnce(new Error("HTTP 500"))
        .mockResolvedValueOnce({ href: "/cal/ok.ics", etag: '"ok"' }),
      deleteRemoteEvent: vi.fn(),
    };
    vi.mocked(adapterForAccount).mockReturnValue(adapter);

    const events = [
      { id: "evt-fail", title: "A", description: null, location: null, starts_at: "2026-09-10T20:00:00.000Z", ends_at: "2026-09-10T21:00:00.000Z", all_day: false },
      { id: "evt-ok", title: "B", description: null, location: null, starts_at: "2026-09-11T20:00:00.000Z", ends_at: "2026-09-11T21:00:00.000Z", all_day: false },
    ];

    const { client, calls } = createFakeSupabaseClient({
      calendar_events: { rows: events },
      calendar_sync_accounts: {},
    });

    const result = await pushToSyncAccount(client as never, baseAccount());

    expect(result.ok).toBe(false);
    expect(result.count).toBe(1);
    expect(result.error).toContain("evt-fail");

    const eventUpdates = calls.filter((c: FakeCall) => c.table === "calendar_events" && c.op === "update");
    expect(eventUpdates).toHaveLength(1);
  });
});
