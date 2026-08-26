// POST /api/calendar/custody/schedules — create a recurring custody
// schedule and immediately materialize its first rolling window into real
// custody_blocks rows. See DECISIONS.md D-033 and lib/custody/schedule.ts.
import { NextResponse } from "next/server";
import { requireHouseholdContext } from "@/lib/auth/session";
import { custodySchedulesRepo } from "@/lib/db/repositories/custody-schedules";
import { custodyScheduleInsertSchema } from "@/lib/db/schemas";
import { materializeCustodySchedule } from "@/lib/custody/materialize";
import { friendlyMutationError } from "@/lib/db/errors";

export async function POST(request: Request) {
  const { supabase, household } = await requireHouseholdContext();
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const parsed = custodyScheduleInsertSchema.safeParse({ ...body, household_id: household.id });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  try {
    const schedule = await custodySchedulesRepo.create(supabase, parsed.data);
    const { blocksCreated } = await materializeCustodySchedule(supabase, schedule);
    return NextResponse.json({ id: schedule.id, blocksCreated });
  } catch (error) {
    return NextResponse.json(
      { error: friendlyMutationError(error, { fallback: "Couldn't save this schedule — please try again." }) },
      { status: 500 }
    );
  }
}
