// Calendar feed sync cron (P3-6). Mirrors app/api/cron/gift-scan/route.ts:
// runs once daily across every household's connected calendar feeds so
// imported events stay current even if nobody opens Settings and hits
// "Sync now". Each feed's own sync failure is caught and recorded on
// that feed's row (see syncCalendarFeed) plus collected here for the
// response body -- one feed's bad URL never blocks another household's
// sync.
import { NextResponse } from "next/server";
import { syncCalendarFeed } from "@/lib/calendar/feed-sync";
import { createSupabaseServiceRoleClient } from "@/lib/db/client-service-role";
import { householdsRepo } from "@/lib/db/repositories/households";
import { listCalendarFeedsForHousehold } from "@/lib/db/repositories/calendar";

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

  return NextResponse.json({ feedsSynced, eventsImported, errors });
}
