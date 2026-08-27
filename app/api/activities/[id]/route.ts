// PATCH /api/activities/[id] — edit an existing user activity (+ its one
// location row, upserted). Mirrors POST /api/activities's shape and
// validation; see that file's header comment for why this is a Route
// Handler rather than a Server Action (DECISIONS.md D-031). D-056: closes
// the "activities are add/delete only, no edit" gap from PROGRESS.md
// Phase 7.
import { NextResponse } from "next/server";
import { requireHouseholdContext } from "@/lib/auth/session";
import { activityLocationsRepo, userActivitiesRepo, listLocationsForActivity } from "@/lib/db/repositories/activities";
import { userActivityUpdateSchema, activityLocationInsertSchema } from "@/lib/db/schemas";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, household } = await requireHouseholdContext();

  // Confirm this activity actually belongs to the caller's household
  // before touching it — RLS also enforces this, but a clear 404 beats a
  // generic RLS-denied error for a straightforward not-found/cross-tenant
  // case (same pattern as D-053's household_id-scoping fix elsewhere).
  const existing = await userActivitiesRepo.getById(supabase, id);
  if (!existing || existing.household_id !== household.id) {
    return NextResponse.json({ error: "Activity not found." }, { status: 404 });
  }

  const formData = await request.formData();
  const preferredCompanions = formData.getAll("preferredCompanionIds").map(String).filter(Boolean);

  const parsed = userActivityUpdateSchema.safeParse({
    activity_type: String(formData.get("activityType") ?? "").trim(),
    enjoyment_rank: Number(formData.get("enjoymentRank") ?? 5),
    typical_duration_minutes: Number(formData.get("typicalDurationMinutes") ?? 120),
    requires_prep: formData.get("requiresPrep") === "on",
    prep_lead_time_hours: formData.get("prepLeadTimeHours") ? Number(formData.get("prepLeadTimeHours")) : null,
    preferred_companions: preferredCompanions,
  });
  if (!parsed.success) {
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
    const activity = await userActivitiesRepo.update(supabase, id, parsed.data);

    const locationName = String(formData.get("locationName") ?? "").trim();
    const existingLocations = await listLocationsForActivity(supabase, id);
    const existingLocation = existingLocations[0] ?? null;

    if (locationName) {
      const externalIds: Record<string, string> = {};
      const usgsGauge = String(formData.get("usgsGauge") ?? "").trim();
      const odfwZoneUrl = String(formData.get("odfwZoneUrl") ?? "").trim();
      const noaaStation = String(formData.get("noaaStation") ?? "").trim();
      if (usgsGauge) externalIds.usgs_gauge = usgsGauge;
      if (odfwZoneUrl) externalIds.odfw_zone_url = odfwZoneUrl;
      if (noaaStation) externalIds.noaa_station = noaaStation;

      const lat = formData.get("locationLat") ? Number(formData.get("locationLat")) : null;
      const lng = formData.get("locationLng") ? Number(formData.get("locationLng")) : null;

      if (existingLocation) {
        const locationParsed = activityLocationInsertSchema
          .omit({ user_activity_id: true })
          .safeParse({ name: locationName, lat, lng, external_ids: externalIds });
        if (locationParsed.success) {
          await activityLocationsRepo.update(supabase, existingLocation.id, locationParsed.data);
        }
      } else {
        const locationParsed = activityLocationInsertSchema.safeParse({
          user_activity_id: id,
          name: locationName,
          lat,
          lng,
          external_ids: externalIds,
        });
        if (locationParsed.success) {
          await activityLocationsRepo.create(supabase, locationParsed.data);
        }
      }
    } else if (existingLocation) {
      // Location name was cleared entirely — remove the now-orphaned
      // location row rather than leaving a blank-named one behind.
      await supabase.from("activity_locations").delete().eq("id", existingLocation.id);
    }

    return NextResponse.json({ id: activity.id });
  } catch (error) {
    console.error(`PATCH /api/activities/${id} failed:`, error);
    return NextResponse.json({ error: "Couldn't save changes — please try again." }, { status: 500 });
  }
}
