import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
import { format, parseISO } from "date-fns";
import { requireHouseholdContext } from "@/lib/auth/session";
import { listActivitiesWithLocations } from "@/lib/db/repositories/activities";
import { listTripIdeasForHousehold } from "@/lib/db/repositories/trip-ideas";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { seasonWindowLabel } from "@/lib/planner/month-names";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DeactivateActivityButton } from "./deactivate-button";
import { MarkDoneButton } from "./mark-done-button";
import { TripIdeasSection } from "./trip-ideas-section";

export default async function ActivitiesPage() {
  const { supabase, household } = await requireHouseholdContext();
  const [activities, tripIdeas, people] = await Promise.all([
    listActivitiesWithLocations(supabase, household.id),
    listTripIdeasForHousehold(supabase, household.id),
    listPeopleForHousehold(supabase, household.id),
  ]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Activities</h1>
        <Button asChild size="sm">
          <Link href="/activities/new">
            <Plus className="size-4" /> Add
          </Link>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        These feed the weekend planner — enjoyment rank, prep needs, and locations drive the scoring.
      </p>

      {activities.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            No activities yet. Add a hobby (golf, fishing, hiking, gym…) so the weekend planner has
            something to score.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {activities.map((activity) => (
            <Card key={activity.id}>
              <CardContent className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{activity.activity_type}</p>
                  <p className="text-xs text-muted-foreground">
                    Enjoyment {activity.enjoyment_rank}/10 · {activity.typical_duration_minutes} min
                    {activity.requires_prep && ` · prep ${activity.prep_lead_time_hours}h ahead`}
                  </p>
                  {(activity.typical_drive_minutes || activity.big_trip_max_drive_minutes) && (
                    <p className="text-xs text-muted-foreground">
                      Drive: {activity.typical_drive_minutes ?? "?"} min typical
                      {activity.big_trip_max_drive_minutes && `, up to ${activity.big_trip_max_drive_minutes} min for a big trip`}
                    </p>
                  )}
                  {activity.locations.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {activity.locations.map((location) => (
                        <Badge key={location.id} variant="outline">
                          {location.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {/* D-083 (P3-1): never show the raw ISO date -- human-readable, matching the rest of the app. */}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {activity.last_done_at
                      ? `Last done ${format(parseISO(activity.last_done_at), "MMM d")}`
                      : "Not logged as done yet"}
                  </p>
                  {/* D-085 (P3-3): month names, never raw 1-12 integers or the raw boolean column. */}
                  {(activity.season_start_month != null || activity.needs_daylight) && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {activity.season_start_month != null && activity.season_end_month != null && (
                        <Badge variant="secondary">
                          Season: {seasonWindowLabel(activity.season_start_month, activity.season_end_month)}
                        </Badge>
                      )}
                      {activity.needs_daylight && <Badge variant="secondary">Needs daylight</Badge>}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <MarkDoneButton activityId={activity.id} />
                  <Button asChild size="icon" variant="ghost" className="size-8">
                    <Link href={`/activities/${activity.id}/edit`} aria-label="Edit activity">
                      <Pencil className="size-4" />
                    </Link>
                  </Button>
                  <DeactivateActivityButton activityId={activity.id} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-4 border-t pt-4">
        <TripIdeasSection tripIdeas={tripIdeas} people={people} />
      </div>
    </div>
  );
}
