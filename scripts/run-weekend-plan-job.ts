// Local manual trigger for the weekend-plan job.
import { generateWeekendPlan } from "../lib/planner/generate";
import { createSupabaseServiceRoleClient } from "../lib/db/client-service-role";
import { householdsRepo } from "../lib/db/repositories/households";

async function main() {
  const client = createSupabaseServiceRoleClient();
  const households = await householdsRepo.list(client);

  for (const household of households) {
    const result = await generateWeekendPlan(client, household.id);
    console.log(`${household.name}: ${result.status}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
