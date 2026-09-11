import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireHouseholdContext } from "@/lib/auth/session";
import { getZonedNow } from "@/lib/timezones";
import { listActiveSuggestionsForHousehold, listGivenGiftsForHouseholdInYear } from "@/lib/db/repositories/gifts";
import { listPeopleForHousehold, listBudgetsForPerson } from "@/lib/db/repositories/people";
import { dedupeSuggestionsPerPerson } from "@/lib/gifts/dedupe";
import { groupSuggestionsByPersonAndRun } from "@/lib/gifts/group-suggestions";
import { scanUpcomingOccasions } from "@/lib/gifts/occasions";
import { RailCard } from "@/components/ui/rail-card";
import { EmptyState } from "@/components/ui/empty-state";
import { GiftSuggestionGroups } from "./gift-suggestion-groups";
import { GiftsTimeline } from "./gifts-timeline";

export default async function GiftsPage() {
  const { supabase, household, timezone } = await requireHouseholdContext();
  const today = getZonedNow(timezone);

  const [rawSuggestions, people, givenGiftsThisYear] = await Promise.all([
    listActiveSuggestionsForHousehold(supabase, household.id),
    listPeopleForHousehold(supabase, household.id),
    listGivenGiftsForHouseholdInYear(supabase, household.id, today.getFullYear()),
  ]);
  const deduped = dedupeSuggestionsPerPerson(rawSuggestions);

  const pending = deduped.filter(
    (s): s is (typeof deduped)[number] & { status: "suggested" } => s.status === "suggested"
  );
  const savedCount = deduped.filter((s) => s.status === "saved" || s.status === "ordered").length;
  const personGroups = groupSuggestionsByPersonAndRun(pending);

  // Redesign (Part 2 — Gifts): "A 90-day timeline at the top with a marker
  // per occasion." Reuses the existing occasion-scan (lib/gifts/occasions.ts,
  // already used by the suggestion engine and Today's "Coming up" rail) --
  // not a new detection system, just a new place it's rendered.
  const HORIZON_DAYS = 90;
  const upcomingOccasions = scanUpcomingOccasions(people, today, HORIZON_DAYS);
  const peopleById = new Map(people.map((p) => [p.id, p]));

  // Budgets per person actually appearing in the pending groups -- fetched
  // once here (existing per-person query) rather than duplicated inside
  // the group component.
  const budgetsByPersonId = new Map<string, Awaited<ReturnType<typeof listBudgetsForPerson>>>();
  for (const group of personGroups) {
    if (!budgetsByPersonId.has(group.personId)) {
      budgetsByPersonId.set(group.personId, await listBudgetsForPerson(supabase, group.personId));
    }
  }

  const ytdSpendCents = givenGiftsThisYear.reduce((sum, g) => sum + (g.cost_cents ?? 0), 0);

  return (
    <div className="flex flex-col gap-[18px] xl:flex-row xl:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-[18px]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-page-title text-ink">Gifts</h1>
            <p className="mt-1 font-sans text-body text-ink-2">Grouped by who and by when — not by when the idea arrived.</p>
          </div>
          <Link
            href="/gifts/saved"
            className="flex items-center gap-1 font-sans text-body font-bold text-action underline-offset-2 hover:underline"
          >
            Saved gifts ({savedCount})
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>

        <GiftsTimeline occasions={upcomingOccasions} peopleById={peopleById} today={today} horizonDays={HORIZON_DAYS} />

        {pending.length === 0 ? (
          <EmptyState
            message={`No open gift suggestions right now. We look ${household.gift_scan_horizon_days} days ahead for birthdays and other occasions — suggestions will show up here as those dates get closer. Make sure the people you want suggestions for have a birthday or occasion date set, or adjust the scan horizon in Settings.${
              savedCount > 0 ? ` You have ${savedCount} saved on your Saved gifts list.` : ""
            }`}
          />
        ) : (
          <GiftSuggestionGroups
            personGroups={personGroups}
            budgetsByPersonId={budgetsByPersonId}
            household={household}
            today={today}
          />
        )}
      </div>

      <div className="w-full xl:w-[280px] xl:shrink-0">
        <RailCard sectionLabel="This year">
          <p className="font-serif text-[34px] leading-none text-ink">${(ytdSpendCents / 100).toFixed(0)}</p>
          <p className="font-sans text-metadata text-meta">
            {givenGiftsThisYear.length} gift{givenGiftsThisYear.length === 1 ? "" : "s"} given · {upcomingOccasions.length}{" "}
            occasion{upcomingOccasions.length === 1 ? "" : "s"} ahead
          </p>
        </RailCard>
      </div>
    </div>
  );
}
