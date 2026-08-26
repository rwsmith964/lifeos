// POST /api/activities — create a user activity (+ optional location). A
// Route Handler rather than a Server Action; see lib/hooks/use-form-post.ts
// and DECISIONS.md D-031.
import { NextResponse } from "next/server";
import { requireHouseholdContext } from "@/lib/auth/session";
import { activityLocationsRepo, userActivitiesRepo } from "@/lib/db/repositories/activities";
import { userActivityInsertSchema, activityLocationInsertSchema } from "@/lib/db/schemas";

export async function POST(request: Request) {
  const { supabase, household, selfPerson } = await requireHouseholdContext();
  const formData = await request.formData();

  const preferredCompanions = formData.getAll("preferredCompanionIds").map(String).filter(Boolean);

  const parsed = userActivityInsertSchema.safeParse({
    household_id: household.id,
    person_id: selfPerson.id,
    activity_type: String(formData.get("activityType") ?? "").trim(),
    enjoyment_rank: Number(formData.get("enjoymentRank") ?? 5),
    typical_duration_minutes: Number(formData.get("typicalDurationMinutes") ?? 120),
    requires_prep: formData.get("requiresPrep") === "on",
    prep_lead_time_hours: formData.get("prepLeadTimeHours") ? Number(formData.get("prepLeadTimeHours")) : null,
    preferred_companions: preferredCompanions,
  });
  if (!parsed.success) {
    // KNOWN-ISSUES.md 1.3: this form has several plausibly-invalid fields
    // (enjoyment rank, duration, prep lead time), so the raw zod message
    // alone isn't enough to know where to show it — the issue's own
    // `path` says exactly which field failed, mapped to this form's input
    // name so the client can place the error there and clear it on edit.
    const issue = parsed.error.issues[0];
    const fieldMap: Record<string, string> = {
      activity_type: "activityType",
      enjoyment_rank: "enjoymentRank",
      typical_duration_minutes: "typicalDurationMinutes",
      prep_lead_time_hours: "prepLeadTimeHours",
    };
    const field = issue?.path[0] ? fieldMap[String(issue.path[0])] : undefined;
    return NextResponse.json({ error: issue?.message ?? "Invalid input.", field }, { status: 400 });
  }

  try {
    const activity = await userActivitiesRepo.create(supabase, parsed.data);

    const locationName = String(formData.get("locationName") ?? "").trim();
    if (locationName) {
      const externalIds: Record<string, string> = {};
      const usgsGauge = String(formData.get("usgsGauge") ?? "").trim();
      const odfwZoneUrl = String(formData.get("odfwZoneUrl") ?? "").trim();
      const noaaStation = String(formData.get("noaaStation") ?? "").trim();
      if (usgsGauge) externalIds.usgs_gauge = usgsGauge;
      if (odfwZoneUrl) externalIds.odfw_zone_url = odfwZoneUrl;
      if (noaaStation) externalIds.noaa_station = noaaStation;

      const locationParsed = activityLocationInsertSchema.safeParse({
        user_activity_id: activity.id,
        name: locationName,
        address: String(formData.get("locationAddress") ?? "").trim() || null,
        lat: formData.get("locationLat") ? Number(formData.get("locationLat")) : null,
        lng: formData.get("locationLng") ? Number(formData.get("locationLng")) : null,
        external_ids: externalIds,
      });
      if (locationParsed.success) {
        await activityLocationsRepo.create(supabase, locationParsed.data);
      }
    }

    return NextResponse.json({ id: activity.id });
  } catch (error) {
    console.error("POST /api/activities failed:", error);
    return NextResponse.json({ error: "Couldn't save this activity — please try again." }, { status: 500 });
  }
}
