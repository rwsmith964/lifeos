import Link from "next/link";
import { ArrowLeft, BookmarkCheck } from "lucide-react";
import { requireHouseholdContext } from "@/lib/auth/session";
import { listActiveSuggestionsForHousehold } from "@/lib/db/repositories/gifts";
import { dedupeSuggestionsPerPerson } from "@/lib/gifts/dedupe";
import { groupSuggestionsByPersonAndRun } from "@/lib/gifts/group-suggestions";
import { Card, CardContent } from "@/components/ui/card";
import { GiftSuggestionGroups } from "../gift-suggestion-groups";

/**
 * P1-12: "Save produces no toast, no badge, no change to the card, and
 * there's no saved-gifts list anywhere in the app." This is that list —
 * every suggestion currently in "saved" status, grouped the same way as
 * the main Gifts page, with Move back / Dismiss actions.
 */
export default async function SavedGiftsPage() {
  const { supabase, household } = await requireHouseholdContext();
  const rawSuggestions = await listActiveSuggestionsForHousehold(supabase, household.id);
  const deduped = dedupeSuggestionsPerPerson(rawSuggestions);
  const saved = deduped.filter(
    (s): s is (typeof deduped)[number] & { status: "saved" } => s.status === "saved"
  );
  const personGroups = groupSuggestionsByPersonAndRun(saved);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <Link href="/gifts" className="text-muted-foreground hover:text-foreground" aria-label="Back to gift suggestions">
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Link>
        <h1 className="text-xl font-semibold">Saved gifts</h1>
      </div>

      {saved.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <BookmarkCheck className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Nothing saved yet. Tap Save on a suggestion from the{" "}
              <Link href="/gifts" className="underline underline-offset-2">
                Gift suggestions
              </Link>{" "}
              page to build a shortlist here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <GiftSuggestionGroups personGroups={personGroups} />
      )}
    </div>
  );
}
