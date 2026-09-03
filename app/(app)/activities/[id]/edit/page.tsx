import { notFound } from "next/navigation";
import { requireHouseholdContext } from "@/lib/auth/session";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { userActivitiesRepo, listLocationsForActivity } from "@/lib/db/repositories/activities";
import { ActivityForm, type ActivityFormDefaults } from "../../activity-form";
import { ActivityLocationsSection } from "../../activity-locations-section";

export default async function EditActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, household } = await requireHouseholdContext();

  const activity = await userActivitiesRepo.getById(supabase, id);
  if (!activity || activity.household_id !== household.id) notFound();

  const [people, locations] = await Promise.all([
    listPeopleForHousehold(supabase, household.id),
    listLocationsForActivity(supabase, id),
  ]);
  const possibleCompanions = people.filter((p) => p.relationship_type !== "self");
  const location = locations[0] ?? null;
  const additionalLocations = locations.slice(1);
  const externalIds = (location?.external_ids ?? {}) as Record<string, string>;

  const defaults: ActivityFormDefaults = {
    activityType: activity.activity_type,
    enjoymentRank: activity.enjoyment_rank,
    typicalDurationMinutes: activity.typical_duration_minutes,
    requiresPrep: activity.requires_prep ?? false,
    prepLeadTimeHours: activity.prep_lead_time_hours,
    preferredCompanionIds: activity.preferred_companions ?? [],
    typicalDriveMinutes: activity.typical_drive_minutes,
    bigTripMaxDriveMinutes: activity.big_trip_max_drive_minutes,
    lastDoneAt: activity.last_done_at,
    seasonStartMonth: activity.season_start_month,
    seasonEndMonth: activity.season_end_month,
    needsDaylight: activity.needs_daylight ?? false,
    locationName: location?.name ?? "",
    locationLat: location?.lat ?? null,
    locationLng: location?.lng ?? null,
    usgsGauge: externalIds.usgs_gauge ?? "",
    odfwZoneUrl: externalIds.odfw_zone_url ?? "",
    noaaStation: externalIds.noaa_station ?? "",
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Edit activity</h1>
      <ActivityForm
        possibleCompanions={possibleCompanions}
        endpoint={`/api/activities/${id}`}
        method="PATCH"
        redirectTo="/activities"
        submitLabel="Save changes"
        pendingLabel="Saving…"
        defaults={defaults}
      />
      <ActivityLocationsSection
        activityId={id}
        additionalLocations={additionalLocations}
        activityTypeHint={activity.activity_type}
      />
    </div>
  );
}
