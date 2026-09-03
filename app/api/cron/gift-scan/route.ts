// Gift occasion scan cron (Section 7.1). Runs once daily across every
// household — cheap and idempotent (scanHouseholdForGiftOccasions skips
// occasions that already have suggestions, and dedupes notifications by
// link_path), so a fixed daily UTC schedule is fine here even though the
// brief cron needs per-timezone precision.
import { NextResponse } from "next/server";
import { scanHouseholdForGiftOccasions } from "@/lib/gifts/scan";
import { createSupabaseServiceRoleClient } from "@/lib/db/client-service-role";
import { householdsRepo } from "@/lib/db/repositories/households";
import { isCronAuthorized } from "@/lib/http/cron-auth";

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const client = createSupabaseServiceRoleClient();
  const households = await householdsRepo.list(client);

  let suggestionsGenerated = 0;
  let notificationsSent = 0;
  const errors: string[] = [];

  for (const household of households) {
    try {
      const result = await scanHouseholdForGiftOccasions(client, household.id);
      suggestionsGenerated += result.suggestionsGenerated;
      notificationsSent += result.notificationsSent;
    } catch (error) {
      errors.push(`${household.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return NextResponse.json({ suggestionsGenerated, notificationsSent, errors });
}
