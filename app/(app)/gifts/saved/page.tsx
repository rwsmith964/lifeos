import Link from "next/link";
import { ArrowLeft, BookmarkCheck } from "lucide-react";
import { requireHouseholdContext } from "@/lib/auth/session";
import { getZonedNow } from "@/lib/timezones";
import { listActiveSuggestionsForHousehold } from "@/lib/db/repositories/gifts";
import { listBudgetsForPerson } from "@/lib/db/repositories/people";
import { dedupeSuggestionsPerPerson } from "@/lib/gifts/dedupe";
import { groupSuggestionsByPersonAndRun } from "@/lib/gifts/group-suggestions";
import { EmptyState } from "@/components/ui/empty-state";
import { GiftSuggestionGroups } from "../gift-suggestion-groups";

/**
 * P1-12: "Save produces no toast, no badge, no change to the card, and
 * there's no saved-gifts list anywhere in the app." This is that list —
 * every suggestion currently in "saved" status, grouped the same way as
 * the main Gifts page, with Move back / Dismiss actions.
 *
 * P3-4: also includes "ordered" suggestions — the middle step of the
 * Saved -> Ordered -> Given shortlist lifecycle. Both statuses stay on
 * this one shortlist page (an ordered gift is still "on the shortlist",
 * just further along) rather than splitting into a second page; each
 * card's own badge/actions (GiftSuggestionActions) already distinguish
 * the two states.
 */
export default async function SavedGiftsPage() {
  const { supabase, household, timezone } = await requireHouseholdContext();
  const today = getZonedNow(timezone);
  const rawSuggestions = await listActiveSuggestionsForHousehold(supabase, household.id);
  const deduped = dedupeSuggestionsPerPerson(rawSuggestions);
  const saved = deduped.filter(
    (s): s is (typeof deduped)[number] & { status: "saved" | "ordered" } =>
      s.status === "saved" || s.status === "ordered"
  );
  const personGroups = groupSuggestionsByPersonAndRun(saved);

  const budgetsByPersonId = new Map<string, Awaited<ReturnType<typeof listBudgetsForPerson>>>();
  for (const group of personGroups) {
    if (!budgetsByPersonId.has(group.personId)) {
      budgetsByPersonId.set(group.personId, await listBudgetsForPerson(supabase, group.personId));
    }
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex items-center gap-2">
        <Link href="/gifts" className="text-ink-2 hover:text-ink" aria-label="Back to gift suggestions">
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Link>
        <h1 className="font-serif text-page-title text-ink">Saved gifts</h1>
      </div>

      {saved.length === 0 ? (
        <EmptyState
          icon={<BookmarkCheck aria-hidden="true" />}
          message={
            <>
              Nothing saved yet. Save a suggestion from the{" "}
              <Link href="/gifts" className="text-action underline underline-offset-2">
                Gifts
              </Link>{" "}
              page to build a shortlist here.
            </>
          }
        />
      ) : (
        <GiftSuggestionGroups personGroups={personGroups} budgetsByPersonId={budgetsByPersonId} household={household} today={today} />
      )}
    </div>
  );
}
