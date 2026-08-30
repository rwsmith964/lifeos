import { parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { orderByStatusLabel } from "@/lib/gifts/leadtime";
import { occasionTypeDisplayLabel } from "@/lib/gifts/occasions";
import type { PersonGroup } from "@/lib/gifts/group-suggestions";
import type { GiftSuggestionRow } from "@/lib/db/database.types";
import { GiftSuggestionActions } from "./gift-suggestion-actions";

const TIER_LABELS: Record<string, string> = { low: "Low", mid: "Mid", high: "High" };

type SuggestionWithStatus = GiftSuggestionRow & { status: "suggested" | "saved" };

/**
 * Shared card rendering for both the main Gifts page (status: suggested)
 * and the Saved gifts view (status: saved) — factored out (P1-12) so the
 * two lists can never visually drift from each other, per the "one part of
 * the app disagreeing with another" ground rule.
 */
export function GiftSuggestionGroups({ personGroups }: { personGroups: PersonGroup<SuggestionWithStatus>[] }) {
  return (
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
                      <GiftSuggestionActions suggestionId={suggestion.id} status={suggestion.status} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

/** P1-11: formats once here for the run sub-heading instead of leaking a
 * raw ISO date on every card. */
function formatOccasionDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(parseISO(isoDate));
}
