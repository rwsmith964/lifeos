// POST /api/packing-lists — create a new trip packing list (D-139, roadmap
// R-2). Route Handler pattern, same rationale as app/api/trip-ideas and
// app/api/people — see DECISIONS.md D-031.
import { NextResponse } from "next/server";
import { requireHouseholdContext } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/flags";
import { packingListsRepo } from "@/lib/db/repositories/packing";
import { packingListInsertSchema } from "@/lib/db/schemas";
import { friendlyMutationError } from "@/lib/db/errors";

export async function POST(request: Request) {
  const { supabase, household, selfPerson } = await requireHouseholdContext();

  const enabled = await isFeatureEnabled(supabase, household.id, "packing_checklist_v2");
  if (!enabled) {
    return NextResponse.json({ error: "The packing checklist wizard isn't turned on for this household." }, { status: 404 });
  }

  const formData = await request.formData();
  const travelerPersonIds = formData.getAll("travelerPersonIds").map(String).filter(Boolean);
  const startDate = String(formData.get("startDate") ?? "").trim();
  const endDate = String(formData.get("endDate") ?? "").trim();

  const parsed = packingListInsertSchema.safeParse({
    household_id: household.id,
    created_by_person_id: selfPerson.id,
    title: String(formData.get("title") ?? "").trim(),
    trip_type: String(formData.get("tripType") ?? "other").trim() || undefined,
    start_date: startDate || null,
    end_date: endDate || null,
    destination: String(formData.get("destination") ?? "").trim() || null,
    traveler_person_ids: travelerPersonIds,
    planned_activities: String(formData.get("plannedActivities") ?? "").trim() || null,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const fieldMap: Record<string, string> = {
      title: "title",
      end_date: "endDate",
    };
    const field = issue?.path[0] ? fieldMap[String(issue.path[0])] : undefined;
    return NextResponse.json({ error: issue?.message ?? "Invalid input.", field }, { status: 400 });
  }

  try {
    const packingList = await packingListsRepo.create(supabase, parsed.data);
    return NextResponse.json({ id: packingList.id });
  } catch (error) {
    return NextResponse.json(
      { error: friendlyMutationError(error, { fallback: "Couldn't save this packing list — please try again." }) },
      { status: 500 }
    );
  }
}
