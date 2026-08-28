// POST /api/trip-ideas — create a someday/bucket-list big trip idea
// (D-059). Route Handler pattern, same rationale as app/api/activities —
// see that file's header comment and DECISIONS.md D-031.
import { NextResponse } from "next/server";
import { requireHouseholdContext } from "@/lib/auth/session";
import { tripIdeasRepo } from "@/lib/db/repositories/trip-ideas";
import { tripIdeaInsertSchema } from "@/lib/db/schemas";

export async function POST(request: Request) {
  const { supabase, household, selfPerson } = await requireHouseholdContext();
  const formData = await request.formData();

  const companionIds = formData.getAll("companionPersonIds").map(String).filter(Boolean);

  const parsed = tripIdeaInsertSchema.safeParse({
    household_id: household.id,
    created_by_person_id: selfPerson.id,
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
    const trip = await tripIdeasRepo.create(supabase, parsed.data);
    return NextResponse.json({ id: trip.id });
  } catch (error) {
    console.error("POST /api/trip-ideas failed:", error);
    return NextResponse.json({ error: "Couldn't save this trip idea — please try again." }, { status: 500 });
  }
}
