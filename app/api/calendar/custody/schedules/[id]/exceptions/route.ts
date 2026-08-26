// POST /api/calendar/custody/schedules/[id]/exceptions — add a one-day
// override (e.g. a holiday swap) to a recurring custody schedule and
// immediately re-materialize its rolling window so custody_blocks reflect
// the change. See lib/custody/materialize.ts and DECISIONS.md D-033.
import { NextResponse } from "next/server";
import { requireHouseholdContext } from "@/lib/auth/session";
import { custodySchedulesRepo, custodyScheduleExceptionsRepo } from "@/lib/db/repositories/custody-schedules";
import { custodyScheduleExceptionInsertSchema } from "@/lib/db/schemas";
import { materializeCustodySchedule } from "@/lib/custody/materialize";
import { friendlyMutationError } from "@/lib/db/errors";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, household } = await requireHouseholdContext();
  const { id } = await params;

  const schedule = await custodySchedulesRepo.getById(supabase, id);
  if (!schedule || schedule.household_id !== household.id) {
    return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const parsed = custodyScheduleExceptionInsertSchema.safeParse({ ...body, custody_schedule_id: id });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  try {
    const exception = await custodyScheduleExceptionsRepo.create(supabase, parsed.data);
    const { blocksCreated } = await materializeCustodySchedule(supabase, schedule);
    return NextResponse.json({ id: exception.id, blocksCreated });
  } catch (error) {
    return NextResponse.json(
      { error: friendlyMutationError(error, { fallback: "Couldn't save this exception — please try again." }) },
      { status: 500 }
    );
  }
}
