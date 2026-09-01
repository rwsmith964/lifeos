// Module 4 — provider adapter layer for two-way calendar sync. One small
// interface so two-way-sync.ts's orchestration logic (pull remote ->
// materialize rows, push local -> remote) doesn't care which provider a
// given calendar_sync_accounts row uses. Only CalDAV (apple_icloud /
// outlook_caldav) is wired for real; google is a selectable-but-disabled
// row shape until QUEUE-015 (Google OAuth app registration) is resolved --
// same "interface ready, implementation deferred" posture the repo already
// uses for notification channels (lib/notifications/dispatch.ts).
import type { CalendarSyncAccountRow } from "../db/database.types";
import { decryptSecret } from "../security/encryption";
import {
  deleteCalendarResource,
  getCalendarResource,
  listCalendarResources,
  putCalendarResource,
  type CalDavCredentials,
  type CalDavResourceRef,
} from "./caldav";
import { isSafeFeedUrl } from "./ics-import";

export interface RemoteCalendarEvent {
  href: string;
  etag: string | null;
  icsText: string;
}

export interface CalendarSyncAdapter {
  readonly provider: CalendarSyncAccountRow["provider"];
  /** Whether this account row has everything the adapter needs to actually run (credentials present, provider enabled). */
  isReady(account: CalendarSyncAccountRow): boolean;
  listRemoteEvents(account: CalendarSyncAccountRow): Promise<RemoteCalendarEvent[]>;
  pushEvent(
    account: CalendarSyncAccountRow,
    icsText: string,
    existing: { href: string; etag: string | null } | null
  ): Promise<CalDavResourceRef>;
  deleteRemoteEvent(account: CalendarSyncAccountRow, ref: { href: string; etag: string | null }): Promise<void>;
}

export class ProviderNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderNotReadyError";
  }
}

function caldavCredentialsFor(account: CalendarSyncAccountRow): CalDavCredentials {
  if (
    !account.caldav_server_url ||
    !account.caldav_username ||
    !account.caldav_app_password_ciphertext ||
    !account.caldav_app_password_iv ||
    !account.caldav_app_password_auth_tag
  ) {
    throw new ProviderNotReadyError(`Calendar sync account ${account.id} is missing CalDAV credentials.`);
  }
  const appPassword = decryptSecret({
    ciphertext: account.caldav_app_password_ciphertext,
    iv: account.caldav_app_password_iv,
    authTag: account.caldav_app_password_auth_tag,
  });
  return { serverUrl: account.caldav_server_url, username: account.caldav_username, appPassword };
}

/**
 * Generic CalDAV adapter, shared by both apple_icloud and outlook_caldav —
 * both providers are plain standards-compliant CalDAV servers reachable
 * with a server URL + username + app-specific password, so there is
 * nothing provider-specific to branch on beyond which server URL the
 * household entered when connecting the account.
 */
export const caldavAdapter: CalendarSyncAdapter = {
  provider: "apple_icloud", // placeholder; caldavAdapterFor() below returns the right provider tag per account
  isReady(account) {
    return (
      (account.provider === "apple_icloud" || account.provider === "outlook_caldav") &&
      isSafeFeedUrl(account.caldav_server_url ?? "").safe &&
      Boolean(account.caldav_username && account.caldav_app_password_ciphertext)
    );
  },
  async listRemoteEvents(account) {
    const creds = caldavCredentialsFor(account);
    const refs = await listCalendarResources(creds);
    const events: RemoteCalendarEvent[] = [];
    for (const ref of refs) {
      const resource = await getCalendarResource(creds, ref);
      events.push(resource);
    }
    return events;
  },
  async pushEvent(account, icsText, existing) {
    const creds = caldavCredentialsFor(account);
    return putCalendarResource(creds, icsText, {
      existingHref: existing?.href,
      existingEtag: existing?.etag,
    });
  },
  async deleteRemoteEvent(account, ref) {
    const creds = caldavCredentialsFor(account);
    await deleteCalendarResource(creds, ref);
  },
};

/** google is intentionally unimplemented -- see QUEUE-015 (no client available to register an OAuth app from this sandbox). */
export const googleAdapter: CalendarSyncAdapter = {
  provider: "google",
  isReady() {
    return Boolean(process.env.GOOGLE_CALENDAR_CLIENT_ID && process.env.GOOGLE_CALENDAR_CLIENT_SECRET);
  },
  async listRemoteEvents() {
    throw new ProviderNotReadyError(
      "Google Calendar sync is not yet available (TODO(QUEUE-015): needs GOOGLE_CALENDAR_CLIENT_ID/SECRET and an OAuth consent flow)."
    );
  },
  async pushEvent() {
    throw new ProviderNotReadyError("Google Calendar sync is not yet available (TODO(QUEUE-015)).");
  },
  async deleteRemoteEvent() {
    throw new ProviderNotReadyError("Google Calendar sync is not yet available (TODO(QUEUE-015)).");
  },
};

export function adapterForAccount(account: CalendarSyncAccountRow): CalendarSyncAdapter {
  if (account.provider === "google") return googleAdapter;
  return caldavAdapter;
}
