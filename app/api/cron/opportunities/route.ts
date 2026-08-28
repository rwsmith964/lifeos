// Opportunity detection cron (D-061). Runs once daily across every
// household — cheap and idempotent (detectOpportunitiesForHousehold skips
// any (household, activity|trip idea, date) combination it has already
// scored, open/dismissed/acted-on alike), so a fixed daily UTC schedule is
// fine here, mirroring the gift-scan cron.
import { NextResponse } from "next/server";
import { detectOpportunitiesForHousehold } from "@/lib/opportunities/detect";
import { createSupabaseServiceRoleClient } from "@/lib/db/client-service-role";
import { householdsRepo } from "@/lib/db/repositories/households";

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

  let opportunitiesDetected = 0;
  let notificationsSent = 0;
  const errors: string[] = [];

  for (const household of households) {
    try {
      const result = await detectOpportunitiesForHousehold(client, household.id);
      opportunitiesDetected += result.opportunitiesDetected;
      if (result.notificationSent) notificationsSent += 1;
    } catch (error) {
      errors.push(`${household.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return NextResponse.json({ opportunitiesDetected, notificationsSent, errors });
}
