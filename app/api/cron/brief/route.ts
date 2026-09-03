// Daily brief cron (Section 10.5). The route logic checks "is it this
// household's brief_time right now, in their own timezone" — designed to
// run hourly (`0 * * * *`) so households.brief_time + the owner's
// users.timezone are honored per-household once this is multi-tenant
// (Section 2.4), not just correct for one hardcoded UTC offset.
//
// vercel.json currently schedules this once daily instead: Vercel's free
// Hobby tier only allows daily cron jobs, and deploying with an hourly
// schedule is rejected outright at deploy time. A single fixed-UTC-hour
// trigger can only approximate one timezone's local morning (off by up to
// an hour across daylight saving, and wrong for any household outside
// that timezone) — the per-household check below still runs correctly
// each time it fires, it just fires less often. Upgrading to Vercel Pro
// and changing vercel.json's brief schedule back to `0 * * * *` restores
// full precision without touching this file.
import { NextResponse } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import { getZonedNow } from "@/lib/timezones";
import { generateDailyBrief } from "@/lib/brief/generate";
import { createSupabaseServiceRoleClient } from "@/lib/db/client-service-role";
import { householdsRepo } from "@/lib/db/repositories/households";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { usersRepo } from "@/lib/db/repositories/households";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured — allow (e.g. local dev)
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const client = createSupabaseServiceRoleClient();
  const now = new Date();

  const households = await householdsRepo.list(client);
  let generated = 0;
  const errors: string[] = [];

  for (const household of households) {
    const people = await listPeopleForHousehold(client, household.id);
    const self = people.find((p) => p.relationship_type === "self");
    if (!self?.user_id) continue;

    const user = await usersRepo.getById(client, self.user_id);
    const timezone = user?.timezone ?? "America/Los_Angeles";
    const currentHourMinute = formatInTimeZone(now, timezone, "HH:mm");
    if (currentHourMinute.slice(0, 2) !== household.brief_time.slice(0, 2)) continue;

    try {
      // D-143: pass the household-local "today" (not the raw UTC `now`
      // instant) so the brief is generated/stored for the day it's
      // actually this household's local calendar date -- generateDailyBrief
      // derives its date-only key (todayDateStr) straight off whatever Date
      // it's given, with no timezone awareness of its own.
      await generateDailyBrief(client, household.id, self.id, getZonedNow(timezone));
      generated++;
    } catch (error) {
      errors.push(`${household.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return NextResponse.json({ generated, errors });
}
