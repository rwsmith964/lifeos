// POST /api/calendar/custody/schedules/[id]/rules -- add a repeating
// variation to a recurring custody schedule ("the other parent has the kids
// on the first Saturday of every month") and re-materialize the schedule's
// rolling window so the calendar reflects it immediately. See
// lib/custody/monthly-rules.ts.
import { NextResponse } from "next/server";
import { requireHouseholdContext } from "@/lib/auth/session";
import { getZonedNow } from "@/lib/timezones";
import { custodySchedulesRepo, custodyScheduleRulesRepo } from "@/lib/db/repositories/custody-schedules";
import { custodyScheduleRuleInsertSchema } from "@/lib/db/schemas";
import { materializeCustodySchedule } from "@/lib/custody/materialize";
import { friendlyMutationError } from "@/lib/db/errors";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, household, timezone } = await requireHouseholdContext();
  const { id } = await params;

  const schedule = await custodySchedulesRepo.getById(supabase, id);
  if (!schedule || schedule.household_id !== household.id) {
    return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const parsed = custodyScheduleRuleInsertSchema.safeParse({ ...body, custody_schedule_id: id });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  try {
    const rule = await custodyScheduleRulesRepo.create(supabase, parsed.data);
    const { blocksCreated } = await materializeCustodySchedule(supabase, schedule, getZonedNow(timezone));
    return NextResponse.json({ id: rule.id, blocksCreated });
  } catch (error) {
    const message = friendlyMutationError(error, { fallback: "Couldn't save this variation — please try again." });
    const isDuplicate = error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505";
    return NextResponse.json(
      { error: isDuplicate ? "You already have a variation for that day of the month." : message },
      { status: isDuplicate ? 409 : 500 }
    );
  }
}
