import Link from "next/link";
import { Plus } from "lucide-react";
import { requireHouseholdContext } from "@/lib/auth/session";
import { listActivitiesWithLocations } from "@/lib/db/repositories/activities";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DeactivateActivityButton } from "./deactivate-button";

export default async function ActivitiesPage() {
  const { supabase, household } = await requireHouseholdContext();
  const activities = await listActivitiesWithLocations(supabase, household.id);

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
                  <p className="text-sm font-medium capitalize">{activity.activity_type}</p>
                  <p className="text-xs text-muted-foreground">
                    Enjoyment {activity.enjoyment_rank}/10 · {activity.typical_duration_minutes} min
                    {activity.requires_prep && ` · prep ${activity.prep_lead_time_hours}h ahead`}
                  </p>
                  {activity.locations[0] && (
                    <Badge variant="outline" className="mt-1">
                      {activity.locations[0].name}
                    </Badge>
                  )}
                </div>
                <DeactivateActivityButton activityId={activity.id} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
