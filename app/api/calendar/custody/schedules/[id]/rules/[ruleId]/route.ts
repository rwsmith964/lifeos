// DELETE /api/calendar/custody/schedules/[id]/rules/[ruleId] -- remove a
// repeating variation and re-materialize the schedule's rolling window so the
// normal pattern takes back over.
import { NextResponse } from "next/server";
import { requireHouseholdContext } from "@/lib/auth/session";
import { getZonedNow } from "@/lib/timezones";
import { custodySchedulesRepo, custodyScheduleRulesRepo } from "@/lib/db/repositories/custody-schedules";
import { materializeCustodySchedule } from "@/lib/custody/materialize";
import { friendlyMutationError } from "@/lib/db/errors";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; ruleId: string }> }) {
  const { supabase, household, timezone } = await requireHouseholdContext();
  const { id, ruleId } = await params;

  const schedule = await custodySchedulesRepo.getById(supabase, id);
  if (!schedule || schedule.household_id !== household.id) {
    return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
  }

  const rule = await custodyScheduleRulesRepo.getById(supabase, ruleId);
  if (!rule || rule.custody_schedule_id !== id) {
    return NextResponse.json({ error: "Variation not found." }, { status: 404 });
  }

  try {
    await custodyScheduleRulesRepo.remove(supabase, ruleId);
    const { blocksCreated } = await materializeCustodySchedule(supabase, schedule, getZonedNow(timezone));
    return NextResponse.json({ ok: true, blocksCreated });
  } catch (error) {
    return NextResponse.json(
      { error: friendlyMutationError(error, { fallback: "Couldn't remove this variation — please try again." }) },
      { status: 500 }
    );
  }
}
