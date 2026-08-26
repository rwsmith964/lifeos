// DELETE /api/calendar/custody/schedules/[id]/exceptions/[exceptionId] —
// remove a single-day override and re-materialize the parent schedule's
// rolling window so the cycle's default assignment takes back over.
import { NextResponse } from "next/server";
import { requireHouseholdContext } from "@/lib/auth/session";
import { custodySchedulesRepo, custodyScheduleExceptionsRepo } from "@/lib/db/repositories/custody-schedules";
import { materializeCustodySchedule } from "@/lib/custody/materialize";
import { friendlyMutationError } from "@/lib/db/errors";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; exceptionId: string }> }
) {
  const { supabase, household } = await requireHouseholdContext();
  const { id, exceptionId } = await params;

  const schedule = await custodySchedulesRepo.getById(supabase, id);
  if (!schedule || schedule.household_id !== household.id) {
    return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
  }

  const exception = await custodyScheduleExceptionsRepo.getById(supabase, exceptionId);
  if (!exception || exception.custody_schedule_id !== id) {
    return NextResponse.json({ error: "Exception not found." }, { status: 404 });
  }

  try {
    await custodyScheduleExceptionsRepo.remove(supabase, exceptionId);
    const { blocksCreated } = await materializeCustodySchedule(supabase, schedule);
    return NextResponse.json({ ok: true, blocksCreated });
  } catch (error) {
    return NextResponse.json(
      { error: friendlyMutationError(error, { fallback: "Couldn't delete this exception — please try again." }) },
      { status: 500 }
    );
  }
}
