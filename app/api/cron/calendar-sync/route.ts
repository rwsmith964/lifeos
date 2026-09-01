// Calendar feed sync cron (P3-6). Mirrors app/api/cron/gift-scan/route.ts:
// runs once daily across every household's connected calendar feeds so
// imported events stay current even if nobody opens Settings and hits
// "Sync now". Each feed's own sync failure is caught and recorded on
// that feed's row (see syncCalendarFeed) plus collected here for the
// response body -- one feed's bad URL never blocks another household's
// sync.
//
// Module 4 (scheduling_v2, D-120) extends this same cron -- rather than
// adding a second cron entry -- to also run two-way CalDAV sync for every
// calendar_sync_accounts row belonging to a household with scheduling_v2
// enabled. Kept in the same route because it is the same "keep calendar data
// fresh on a timer" job as the one-way ICS feed sync above; a household with
// the flag off has zero calendar_sync_accounts rows to iterate, so this is a
// no-op for it (Additive Contract: behavior unchanged with the flag off).
import { NextResponse } from "next/server";
import { syncCalendarFeed } from "@/lib/calendar/feed-sync";
import { pullFromSyncAccount, pushToSyncAccount } from "@/lib/calendar/two-way-sync";
import { createSupabaseServiceRoleClient } from "@/lib/db/client-service-role";
import { householdsRepo } from "@/lib/db/repositories/households";
import { listCalendarFeedsForHousehold } from "@/lib/db/repositories/calendar";
import { listCalendarSyncAccountsForHousehold } from "@/lib/db/repositories/scheduling";
import { isFeatureEnabled } from "@/lib/flags";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const client = createSupabaseServiceRoleClient();
  const households = await householdsRepo.list(client);

  let feedsSynced = 0;
  let eventsImported = 0;
  const errors: string[] = [];

  for (const household of households) {
    try {
      const feeds = await listCalendarFeedsForHousehold(client, household.id);
      for (const feed of feeds) {
        try {
          const result = await syncCalendarFeed(client, feed);
          feedsSynced += 1;
          eventsImported += result.eventsImported;
          if (!result.ok) {
            errors.push(`${household.id}/${feed.id}: ${result.error}`);
          }
        } catch (error) {
          errors.push(`${household.id}/${feed.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error) {
      errors.push(`${household.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  let syncAccountsProcessed = 0;
  let caldavEventsImported = 0;
  let caldavEventsPushed = 0;

  for (const household of households) {
    try {
      if (!(await isFeatureEnabled(client, household.id, "scheduling_v2"))) continue;
      const accounts = await listCalendarSyncAccountsForHousehold(client, household.id);
      for (const account of accounts) {
        try {
          const pullResult = await pullFromSyncAccount(client, account);
          if (!pullResult.skipped) {
            syncAccountsProcessed += 1;
            caldavEventsImported += pullResult.count;
            if (!pullResult.ok) errors.push(`${household.id}/sync/${account.id}/pull: ${pullResult.error}`);
          }

          const pushResult = await pushToSyncAccount(client, account);
          if (!pushResult.skipped) {
            caldavEventsPushed += pushResult.count;
            if (!pushResult.ok) errors.push(`${household.id}/sync/${account.id}/push: ${pushResult.error}`);
          }
        } catch (error) {
          errors.push(`${household.id}/sync/${account.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error) {
      errors.push(`${household.id}/sync: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return NextResponse.json({
    feedsSynced,
    eventsImported,
    syncAccountsProcessed,
    caldavEventsImported,
    caldavEventsPushed,
    errors,
  });
}
