import Link from "next/link";
import { parseISO } from "date-fns";
import { Gift } from "lucide-react";
import { requireHouseholdContext } from "@/lib/auth/session";
import { listActiveSuggestionsForHousehold } from "@/lib/db/repositories/gifts";
import { dedupeSuggestionsPerPerson } from "@/lib/gifts/dedupe";
import { groupSuggestionsByPersonAndRun } from "@/lib/gifts/group-suggestions";
import { orderByStatusLabel } from "@/lib/gifts/leadtime";
import { occasionTypeDisplayLabel } from "@/lib/gifts/occasions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GiftSuggestionActions } from "./gift-suggestion-actions";

const TIER_LABELS: Record<string, string> = { low: "Low", mid: "Mid", high: "High" };

export default async function GiftsPage() {
  const { supabase, household } = await requireHouseholdContext();
  // P1-11: the repo query is stably sorted (order_by_date, then
  // person_id/generated_at/id tiebreakers), so "first occurrence per
  // person" below is always the most urgent duplicate to keep. Dedup runs
  // per person (a shared idea across two different people is not a bug),
  // then the deduped, still-stably-sorted list is grouped by person and by
  // occasion run for display.
  const rawSuggestions = await listActiveSuggestionsForHousehold(supabase, household.id);
  const suggestions = dedupeSuggestionsPerPerson(rawSuggestions);
  const personGroups = groupSuggestionsByPersonAndRun(suggestions);

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Gift suggestions</h1>

      {suggestions.length === 0 ? (
        // Was a single generic sentence with no indication of *why* nothing
        // showed up, or what to actually do about it (Phase 3 backlog: "poor
        // empty-state copy"). Now names the household's actual configured
        // horizon (instead of the vague "the scan horizon") and gives two
        // concrete next steps: add people/occasions, or adjust the horizon
        // if it seems too short.
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <Gift className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              No open gift suggestions right now. We look {household.gift_scan_horizon_days} days ahead for
              birthdays and other occasions — suggestions will show up here as those dates get closer.
            </p>
            <p className="text-xs text-muted-foreground">
              Make sure the people you want suggestions for have a birthday or occasion date set, or{" "}
              <Link href="/settings" className="underline underline-offset-2">
                adjust the scan horizon
              </Link>{" "}
              in settings.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {personGroups.map((person) => (
            <section key={person.personId} className="flex flex-col gap-4">
              <h2 className="text-base font-semibold">{person.personName}</h2>
              {person.runs.map((run) => (
                <div key={`${run.occasionType}__${run.occasionDate}`} className="flex flex-col gap-3">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {occasionTypeDisplayLabel(run.occasionType)} · {formatOccasionDate(run.occasionDate)}
                  </p>
                  <div className="flex flex-col gap-3">
                    {run.suggestions.map((suggestion) => (
                      <Card key={suggestion.id}>
                        <CardHeader>
                          <div className="flex items-start justify-between gap-2">
                            <CardTitle className="text-sm">{suggestion.title}</CardTitle>
                            <Badge variant="outline">{TIER_LABELS[suggestion.price_tier]}</Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-2">
                          <p className="text-sm">{suggestion.reasoning}</p>
                          <p className="text-sm font-medium">${(suggestion.estimated_cost_cents / 100).toFixed(2)}</p>
                          {(() => {
                            // P1-10: never render the raw order_by_date once it's in
                            // the past — "Needed now" replaces a stale-looking
                            // calendar date, and days-remaining replaces it while
                            // there's still time, so the deadline is always relative
                            // and actionable instead of raw ISO text.
                            const status = orderByStatusLabel(new Date(suggestion.order_by_date), new Date());
                            return (
                              <p
                                className={
                                  status.isPastDue ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"
                                }
                              >
                                {status.label}
                              </p>
                            );
                          })()}
                          {suggestion.product_url && (
                            <a
                              href={suggestion.product_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-primary underline underline-offset-4"
                            >
                              Search on {suggestion.retailer ?? "the web"}
                            </a>
                          )}
                          <GiftSuggestionActions suggestionId={suggestion.id} />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/** P1-11: the per-card "For {person} · {occasion_type} {occasion_date}"
 * line is now redundant with the person/run group headers above it (and
 * previously leaked a raw ISO date + raw enum) — formatted once here for
 * the run sub-heading instead. */
function formatOccasionDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(parseISO(isoDate));
}
