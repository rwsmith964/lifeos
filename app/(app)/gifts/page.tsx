import { requireHouseholdContext } from "@/lib/auth/session";
import { listActiveSuggestionsForHousehold } from "@/lib/db/repositories/gifts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GiftSuggestionActions } from "./gift-suggestion-actions";

const TIER_LABELS: Record<string, string> = { low: "Low", mid: "Mid", high: "High" };

export default async function GiftsPage() {
  const { supabase, household } = await requireHouseholdContext();
  const suggestions = await listActiveSuggestionsForHousehold(supabase, household.id);

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Gift suggestions</h1>

      {suggestions.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            No open gift suggestions. They&apos;ll appear here as occasions come up within the scan
            horizon.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {suggestions.map((suggestion) => (
            <Card key={suggestion.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm">{suggestion.title}</CardTitle>
                  <Badge variant="outline">{TIER_LABELS[suggestion.price_tier]}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">
                  For {suggestion.person.full_name} · {suggestion.occasion_type} {suggestion.occasion_date}
                </p>
                <p className="text-sm">{suggestion.reasoning}</p>
                <p className="text-sm font-medium">${(suggestion.estimated_cost_cents / 100).toFixed(2)}</p>
                <p className="text-xs text-destructive">Order by {suggestion.order_by_date}</p>
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
      )}
    </div>
  );
}
