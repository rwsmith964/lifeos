// PATCH/DELETE /api/trip-ideas/[id] — edit or remove a big-trip idea
// (D-059). Mirrors app/api/activities/[id]/route.ts's shape.
import { NextResponse } from "next/server";
import { requireHouseholdContext } from "@/lib/auth/session";
import { tripIdeasRepo } from "@/lib/db/repositories/trip-ideas";
import { tripIdeaUpdateSchema } from "@/lib/db/schemas";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, household } = await requireHouseholdContext();

  const existing = await tripIdeasRepo.getById(supabase, id);
  if (!existing || existing.household_id !== household.id) {
    return NextResponse.json({ error: "Trip idea not found." }, { status: 404 });
  }

  const formData = await request.formData();
  const companionIds = formData.getAll("companionPersonIds").map(String).filter(Boolean);

  const parsed = tripIdeaUpdateSchema.safeParse({
    title: String(formData.get("title") ?? "").trim(),
    activity_type: String(formData.get("activityType") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim() || null,
    target_timeframe: String(formData.get("targetTimeframe") ?? "").trim() || null,
    companion_person_ids: companionIds,
    status: String(formData.get("status") ?? "idea"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const fieldMap: Record<string, string> = {
      title: "title",
      status: "status",
    };
    const field = issue?.path[0] ? fieldMap[String(issue.path[0])] : undefined;
    return NextResponse.json({ error: issue?.message ?? "Invalid input.", field }, { status: 400 });
  }

  try {
    const trip = await tripIdeasRepo.update(supabase, id, parsed.data);
    return NextResponse.json({ id: trip.id });
  } catch (error) {
    console.error(`PATCH /api/trip-ideas/${id} failed:`, error);
    return NextResponse.json({ error: "Couldn't save changes — please try again." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, household } = await requireHouseholdContext();

  const existing = await tripIdeasRepo.getById(supabase, id);
  if (!existing || existing.household_id !== household.id) {
    return NextResponse.json({ error: "Trip idea not found." }, { status: 404 });
  }

  try {
    await tripIdeasRepo.remove(supabase, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(`DELETE /api/trip-ideas/${id} failed:`, error);
    return NextResponse.json({ error: "Couldn't delete this trip idea — please try again." }, { status: 500 });
  }
}
