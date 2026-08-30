import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Zap } from "lucide-react";
import { requireHouseholdContext } from "@/lib/auth/session";
import { listOpenOpportunitiesWithSubjectForHousehold } from "@/lib/db/repositories/opportunities";
import { getPresentedOpportunities, type OpportunityTier } from "@/lib/opportunities/present";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OpportunityActions } from "./opportunity-actions";

const TIER_BADGE_VARIANT: Record<OpportunityTier, "default" | "secondary" | "outline"> = {
  Exceptional: "default",
  Great: "secondary",
  Good: "outline",
};

export default async function OpportunitiesPage() {
  const { supabase, household } = await requireHouseholdContext();

  const rawOpportunities = await listOpenOpportunitiesWithSubjectForHousehold(supabase, household.id);
  // P1-6/D-070: threshold, family-dedupe, cap, and day-grouping all happen
  // here so this page, the Brief card, and the Calendar nudge always agree
  // on what counts as a standout.
  const { byDay } = getPresentedOpportunities(rawOpportunities);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">Opportunities</h1>
        <p className="text-sm text-muted-foreground">
          Days ahead with standout weather and enough open time on the calendar for something on your list.
        </p>
      </div>

      {byDay.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            Nothing stands out right now. This checks your activities and trip ideas against the forecast and your
            calendar once a day — you&rsquo;ll see a card here when something clears the bar.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {byDay.map((day) => (
            <div key={day.forDate} className="flex flex-col gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">
                {format(parseISO(day.forDate), "EEEE, MMM d")}
              </h2>
              {day.opportunities.map((opp) => (
                <Card key={opp.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Zap className="size-4" /> {opp.headline}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    <p className="text-sm text-muted-foreground">{opp.reasoning}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={TIER_BADGE_VARIANT[opp.tier]}>{opp.tier}</Badge>
                      <Badge variant="outline">Score {opp.score}/100</Badge>
                      {opp.activity_id && (
                        <Link
                          href={`/activities/${opp.activity_id}`}
                          className="text-xs underline-offset-2 hover:underline"
                        >
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
          ))}
        </div>
      )}
    </div>
  );
}
