import Link from "next/link";
import { Gift, ChevronRight } from "lucide-react";
import { requireHouseholdContext } from "@/lib/auth/session";
import { listActiveSuggestionsForHousehold } from "@/lib/db/repositories/gifts";
import { dedupeSuggestionsPerPerson } from "@/lib/gifts/dedupe";
import { groupSuggestionsByPersonAndRun } from "@/lib/gifts/group-suggestions";
import { Card, CardContent } from "@/components/ui/card";
import { GiftSuggestionGroups } from "./gift-suggestion-groups";

export default async function GiftsPage() {
  const { supabase, household } = await requireHouseholdContext();
  // P1-11: the repo query is stably sorted (order_by_date, then
  // person_id/generated_at/id tiebreakers), so "first occurrence per
  // person" below is always the most urgent duplicate to keep. Dedup runs
  // per person (a shared idea across two different people is not a bug),
  // then the deduped, still-stably-sorted list is grouped by person and by
  // occasion run for display.
  const rawSuggestions = await listActiveSuggestionsForHousehold(supabase, household.id);
  const deduped = dedupeSuggestionsPerPerson(rawSuggestions);

  // P1-12: once a suggestion is Saved it moves out of the "to consider"
  // list on this page and into the dedicated Saved gifts view below — the
  // same way Dismiss already removes a card, so a decision (either
  // direction) always visibly changes this list instead of leaving a
  // saved card sitting here indistinguishable from an undecided one.
  const pending = deduped.filter(
    (s): s is (typeof deduped)[number] & { status: "suggested" } => s.status === "suggested"
  );
  const savedCount = deduped.filter((s) => s.status === "saved").length;
  const personGroups = groupSuggestionsByPersonAndRun(pending);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Gift suggestions</h1>
        <Link
          href="/gifts/saved"
          className="flex items-center gap-1 text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          Saved gifts ({savedCount})
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>

      {pending.length === 0 ? (
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
              {savedCount > 0 && (
                <>
                  {" "}
                  You have {savedCount} saved on your{" "}
                  <Link href="/gifts/saved" className="underline underline-offset-2">
                    Saved gifts
                  </Link>{" "}
                  list.
                </>
              )}
            </p>
          </CardContent>
        </Card>
      ) : (
        <GiftSuggestionGroups personGroups={personGroups} />
      )}
    </div>
  );
}
