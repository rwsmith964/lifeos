// D-04 (audit pass 2026-09-11): re-materializes every household's custody
// schedules once, using the M-01-fixed materializeCustodySchedule (a single
// consistent household-local windowStart per call, instead of a bare
// `new Date()` that could disagree with an earlier call and leave
// overlapping duplicate blocks behind -- see lib/custody/materialize.ts).
// materializeCustodySchedule already deletes each schedule's own
// future-window blocks before re-inserting, so simply calling it again now
// cleans up whatever duplicates already accumulated, with no bespoke
// duplicate-detection SQL needed. Safe to re-run.
import { createSupabaseServiceRoleClient } from "../lib/db/client-service-role";
import { householdsRepo, usersRepo } from "../lib/db/repositories/households";
import { peopleRepo } from "../lib/db/repositories/people";
import { listCustodySchedulesForHousehold } from "../lib/db/repositories/custody-schedules";
import { materializeCustodySchedule } from "../lib/custody/materialize";
import { getZonedNow } from "../lib/timezones";

async function findHouseholdTimezone(client: ReturnType<typeof createSupabaseServiceRoleClient>, householdId: string) {
  const people = await peopleRepo.list(client, (q) =>
    q.eq("household_id", householdId).eq("relationship_type", "self").limit(1)
  );
  const self = people[0];
  if (!self?.user_id) return "America/Los_Angeles";
  const user = await usersRepo.getById(client, self.user_id);
  return user?.timezone ?? "America/Los_Angeles";
}

// Scoped to the real household this audit is about, not every household in
// the database (which also holds unrelated seed/demo data from other
// engagements) -- pass a different id via argv if this needs to run for a
// different household later.
const TARGET_HOUSEHOLD_ID = process.argv[2] ?? "312f2e2e-63a8-4a61-88d7-4f1c29e23ef8";

async function main() {
  const client = createSupabaseServiceRoleClient();
  const households = (await householdsRepo.list(client)).filter((h) => h.id === TARGET_HOUSEHOLD_ID);
  if (households.length === 0) {
    console.error(`Household ${TARGET_HOUSEHOLD_ID} not found.`);
    process.exit(1);
  }

  for (const household of households) {
    const schedules = await listCustodySchedulesForHousehold(client, household.id);
    if (schedules.length === 0) continue;
    const timezone = await findHouseholdTimezone(client, household.id);
    const now = getZonedNow(timezone);
    for (const schedule of schedules) {
      const { blocksCreated } = await materializeCustodySchedule(client, schedule, now);
      console.log(`${household.name} / schedule ${schedule.id}: ${blocksCreated} block(s) materialized.`);
    }
  }
  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
