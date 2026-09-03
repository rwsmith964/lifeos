// Weekend plan cron (Section 9). Runs Wednesday mornings UTC, ahead of the
// Wed-Fri window the brief engine mentions it in — generateWeekendPlan is
// idempotent per (household, for_date) via the unique index, so an
// off-by-a-few-hours UTC/local mismatch just means "generated a bit early
// or late," never a duplicate.
import { NextResponse } from "next/server";
import { generateWeekendPlan } from "@/lib/planner/generate";
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

  let generated = 0;
  const errors: string[] = [];

  for (const household of households) {
    try {
      const result = await generateWeekendPlan(client, household.id);
      // D-135: "traveling" is also a successfully-persisted plan (a
      // trip-prep nudge instead of a local recommendation) -- count it the
      // same as "generated" so this counter still reflects households
      // that got SOME plan written, not just ones that got a local outing.
      if (result.status === "generated" || result.status === "traveling") generated++;
    } catch (error) {
      errors.push(`${household.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return NextResponse.json({ generated, errors });
}
