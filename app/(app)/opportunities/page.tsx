import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Zap } from "lucide-react";
import { requireHouseholdContext } from "@/lib/auth/session";
import { listOpenOpportunitiesForHousehold } from "@/lib/db/repositories/opportunities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OpportunityActions } from "./opportunity-actions";

export default async function OpportunitiesPage() {
  const { supabase, household } = await requireHouseholdContext();

  const opportunities = await listOpenOpportunitiesForHousehold(supabase, household.id);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">Opportunities</h1>
        <p className="text-sm text-muted-foreground">
          Days ahead with exceptionally good weather and enough open time on the calendar for something on your list.
        </p>
      </div>

      {opportunities.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            No opportunities detected right now. This checks your activities and trip ideas against the forecast and
            your calendar once a day.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {opportunities.map((opp) => (
            <Card key={opp.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Zap className="size-4" /> {opp.headline}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">{opp.reasoning}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{format(parseISO(opp.for_date), "EEEE, MMM d")}</Badge>
                  <Badge variant="outline">Score {opp.score}/100</Badge>
                  {opp.activity_id && (
                    <Link href={`/activities/${opp.activity_id}`} className="text-xs underline-offset-2 hover:underline">
                      View activity
                    </Link>
                  )}
                  {opp.trip_idea_id && (
                    <Link
                      href={`/activities/trips/${opp.trip_idea_id}/edit`}
                      className="text-xs underline-offset-2 hover:underline"
                    >
                      View trip idea
                    </Link>
                  )}
                </div>
                <OpportunityActions opportunityId={opp.id} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
