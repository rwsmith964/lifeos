// DELETE /api/calendar/custody/schedules/[id] — remove a recurring
// schedule and its own future-window blocks (past blocks stay as
// history, orphaned via custody_blocks.custody_schedule_id ON DELETE SET
// NULL at the DB level, but deleted explicitly here first so "delete this
// schedule" actually stops it from covering future days).
import { NextResponse } from "next/server";
import { requireHouseholdContext } from "@/lib/auth/session";
import { custodySchedulesRepo } from "@/lib/db/repositories/custody-schedules";
import { friendlyMutationError } from "@/lib/db/errors";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, household } = await requireHouseholdContext();
  const { id } = await params;

  const schedule = await custodySchedulesRepo.getById(supabase, id);
  if (!schedule || schedule.household_id !== household.id) {
    return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
  }

  try {
    const { error: deleteBlocksError } = await supabase
      .from("custody_blocks")
      .delete()
      .eq("custody_schedule_id", id)
      .gte("starts_at", new Date().toISOString());
    if (deleteBlocksError) throw deleteBlocksError;

    await custodySchedulesRepo.remove(supabase, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: friendlyMutationError(error, { fallback: "Couldn't delete this schedule — please try again." }) },
      { status: 500 }
    );
  }
}
