import { notFound } from "next/navigation";
import { requireHouseholdContext } from "@/lib/auth/session";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { userActivitiesRepo, listLocationsForActivity } from "@/lib/db/repositories/activities";
import { isFeatureEnabled } from "@/lib/flags";
import {
  listGearChecklistItemsForActivity,
  listGearChecklistItemsForType,
  listOutingLogsForActivity,
} from "@/lib/db/repositories/leisure-planner";
import { activityTypeKey } from "@/lib/db/schemas";
import { resolveGearChecklist } from "@/lib/planner/gear-checklist";
import { ActivityForm, type ActivityFormDefaults } from "../../activity-form";
import { ActivityLocationsSection } from "../../activity-locations-section";
import { AddActivityGearChecklistItemForm, AddOutingLogForm, OutingLogRow, ResolvedGearChecklistList } from "../../leisure-planner-forms";

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

  const plannerEnabled = await isFeatureEnabled(supabase, household.id, "leisure_planner_v2");
  const [activityGearItems, typeGearItems, outingLogs] = plannerEnabled
    ? await Promise.all([
        listGearChecklistItemsForActivity(supabase, id),
        listGearChecklistItemsForType(supabase, household.id, activityTypeKey(activity.activity_type)),
        listOutingLogsForActivity(supabase, id),
      ])
    : [[], [], []];
  const resolvedGearItems = resolveGearChecklist(activityGearItems, typeGearItems);
  const householdPeopleById = new Map(people.map((p) => [p.id, p.full_name]));
  const gearItemLabelById = new Map(resolvedGearItems.map((item) => [item.id, item.label]));
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
      {plannerEnabled && (
        <>
          <div className="mt-4 flex flex-col gap-2 border-t pt-4">
            <h2 className="text-sm font-medium">Gear checklist</h2>
            <ResolvedGearChecklistList items={resolvedGearItems} />
            <AddActivityGearChecklistItemForm userActivityId={id} />
          </div>
          <div className="mt-4 flex flex-col gap-2 border-t pt-4">
            <h2 className="text-sm font-medium">Outing log</h2>
            {outingLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No outings logged yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {outingLogs.map((log) => (
                  <OutingLogRow
                    key={log.id}
                    log={log}
                    householdPeopleById={householdPeopleById}
                    gearItemLabelById={gearItemLabelById}
                  />
                ))}
              </div>
            )}
            <AddOutingLogForm userActivityId={id} possibleCompanions={possibleCompanions} gearItems={resolvedGearItems} />
          </div>
        </>
      )}
    </div>
  );
}
