// Local manual trigger for the gift occasion scan job.
import { scanHouseholdForGiftOccasions } from "../lib/gifts/scan";
import { createSupabaseServiceRoleClient } from "../lib/db/client-service-role";
import { householdsRepo } from "../lib/db/repositories/households";

async function main() {
  const client = createSupabaseServiceRoleClient();
  const households = await householdsRepo.list(client);

  for (const household of households) {
    const result = await scanHouseholdForGiftOccasions(client, household.id);
    console.log(
      `${household.name}: ${result.suggestionsGenerated} suggestion(s) generated, ${result.notificationsSent} notification(s) sent.`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
