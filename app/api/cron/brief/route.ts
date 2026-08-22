// Daily brief cron (Section 10.5). Scheduled hourly rather than once at a
// fixed UTC time — households.brief_time + the owner's users.timezone are
// per-household, and Vercel Cron schedules are UTC-only, so an hourly tick
// that checks "is it this household's brief_time right now, in their own
// timezone" is what actually makes "default 6:00 AM in the user's
// timezone" correct once this is multi-tenant (Section 2.4), not just
// correct for one hardcoded UTC offset today.
import { NextResponse } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
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
      await generateDailyBrief(client, household.id, self.id, now);
      generated++;
    } catch (error) {
      errors.push(`${household.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return NextResponse.json({ generated, errors });
}
