// Local manual trigger for the daily brief job (Section 10.5: "Locally,
// provide a `pnpm run job:brief` script so jobs can be triggered by hand").
// Unlike the cron route, this generates for every household regardless of
// the current hour, since running it by hand IS the "it's time" signal.
import { generateDailyBrief } from "../lib/brief/generate";
import { createSupabaseServiceRoleClient } from "../lib/db/client-service-role";
import { householdsRepo } from "../lib/db/repositories/households";
import { listPeopleForHousehold } from "../lib/db/repositories/people";

async function main() {
  const client = createSupabaseServiceRoleClient();
  const households = await householdsRepo.list(client);

  let generated = 0;
  for (const household of households) {
    const people = await listPeopleForHousehold(client, household.id);
    const self = people.find((p) => p.relationship_type === "self");
    if (!self) {
      console.warn(`Household ${household.id} (${household.name}) has no 'self' person — skipping.`);
      continue;
    }
    const result = await generateDailyBrief(client, household.id, self.id);
    console.log(`${household.name}: ${result.status}`);
    if (result.status === "generated") generated++;
  }

  console.log(`Done. Generated ${generated} brief(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
