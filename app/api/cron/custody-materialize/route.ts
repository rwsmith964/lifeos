// Rolling custody horizon. A custody schedule only generates real
// custody_blocks rows for the next MATERIALIZE_WINDOW_DAYS days, and until
// now that happened only when someone saved the schedule -- so every
// schedule's calendar went silently blank once its last save fell more than
// 90 days behind (the live household's blocks would have ended Dec 11 with
// no warning). This re-extends every active schedule's window daily.
// Idempotent: materializeCustodySchedule replaces only its own schedule's
// future blocks, never manually created one-off blocks.
import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/db/client-service-role";
import { householdsRepo, usersRepo } from "@/lib/db/repositories/households";
import { peopleRepo } from "@/lib/db/repositories/people";
import { listCustodySchedulesForHousehold } from "@/lib/db/repositories/custody-schedules";
import { materializeCustodySchedule } from "@/lib/custody/materialize";
import { getZonedNow } from "@/lib/timezones";
import { isCronAuthorized } from "@/lib/http/cron-auth";

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const client = createSupabaseServiceRoleClient();
  const households = await householdsRepo.list(client);

  let schedulesRefreshed = 0;
  let blocksCreated = 0;
  const errors: string[] = [];

  for (const household of households) {
    try {
      const schedules = (await listCustodySchedulesForHousehold(client, household.id)).filter((s) => s.is_active);
      if (schedules.length === 0) continue;

      const selfPeople = await peopleRepo.list(client, (q) =>
        q.eq("household_id", household.id).eq("relationship_type", "self").limit(1)
      );
      const ownerUserId = selfPeople[0]?.user_id;
      const owner = ownerUserId ? await usersRepo.getById(client, ownerUserId) : null;
      const now = getZonedNow(owner?.timezone ?? "America/Los_Angeles");

      for (const schedule of schedules) {
        const result = await materializeCustodySchedule(client, schedule, now);
        schedulesRefreshed += 1;
        blocksCreated += result.blocksCreated;
      }
    } catch (error) {
      errors.push(`${household.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return NextResponse.json({ schedulesRefreshed, blocksCreated, errors });
}
