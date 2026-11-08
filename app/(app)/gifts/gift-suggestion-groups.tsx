import { differenceInCalendarDays, parseISO } from "date-fns";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { orderByStatusLabel } from "@/lib/gifts/leadtime";
import { occasionTypeDisplayLabel } from "@/lib/gifts/occasions";
import { resolveGiftBudget } from "@/lib/gifts/budget";
import { isGenericWebSearchUrl } from "@/lib/gifts/retailer-links";
import type { PersonGroup } from "@/lib/gifts/group-suggestions";
import type { GiftSuggestionRow, HouseholdRow, PersonGiftBudgetRow } from "@/lib/db/database.types";
import { GiftSuggestionActions } from "./gift-suggestion-actions";

const TIER_LABELS: Record<string, string> = { low: "Low", mid: "Mid", high: "High" };

type SuggestionWithStatus = GiftSuggestionRow & { status: "suggested" | "saved" | "ordered" };

/**
 * Shared card rendering for the main Gifts page (status: suggested) and the
 * Saved gifts view (status: saved or ordered, P3-4) — factored out (P1-12)
 * so the lists can never visually drift from each other.
 *
 * Redesign (Part 2 — Gifts): "Group header: avatar, 'Fritz — birthday',
 * date and days remaining, an order-by date, budget range, spend bar, and
 * an order-status badge. Idea cards in a four-column grid." The group
 * header's budget range comes from the real resolveGiftBudget resolution
 * (person+occasion -> person default -> household default -> fallback);
 * the spend bar totals estimated_cost_cents across whatever suggestions are
 * actually shown in this run (all "suggested" on the main page, so it reads
 * $0 there -- nothing has been committed to yet, which is the honest
 * reading rather than a fabricated projection).
 */
export function GiftSuggestionGroups({
  personGroups,
  budgetsByPersonId,
  household,
  today,
}: {
  personGroups: PersonGroup<SuggestionWithStatus>[];
  budgetsByPersonId: Map<string, Pick<PersonGiftBudgetRow, "occasion_type" | "min_cents" | "max_cents">[]>;
  household: Pick<HouseholdRow, "default_gift_budget_min_cents" | "default_gift_budget_max_cents">;
  today: Date;
}) {
  return (
    <div className="flex flex-col gap-[34px]">
      {personGroups.map((person) => (
        <section key={person.personId} className="flex flex-col gap-[18px]">
          <div className="flex items-center gap-3">
            <Avatar name={person.personName} size={36} />
            <h2 className="font-sans text-card-headline text-ink">{person.personName}</h2>
          </div>
          {person.runs.map((run) => {
            const occasionDate = parseISO(run.occasionDate);
            const daysRemaining = differenceInCalendarDays(occasionDate, today);
            const budgets = budgetsByPersonId.get(person.personId) ?? [];
            const budget = resolveGiftBudget(budgets, run.occasionType, household);
            // M-05: only a real order counts as spent -- shortlisting
            // (status "saved") isn't money spent, it's an idea you're
            // considering. Previously the spend bar counted saved+ordered
            // together, which flipped a $0-spent budget to "$80 spent" the
            // moment a suggestion was shortlisted, before anything was
            // actually bought. Saved-but-not-ordered items are shown
            // separately below as "earmarked," differently styled, so that
            // figure doesn't disappear, it just isn't conflated with spend.
            const spendCents = run.suggestions.reduce(
              (sum, s) => (s.status === "ordered" ? sum + s.estimated_cost_cents : sum),
              0
            );
            const earmarkedCents = run.suggestions.reduce(
              (sum, s) => (s.status === "saved" ? sum + s.estimated_cost_cents : sum),
              0
            );
            const spendPercent = Math.min(100, (spendCents / budget.maxCents) * 100);
            const mostUrgent = run.suggestions.reduce((earliest, s) =>
              s.order_by_date < earliest.order_by_date ? s : earliest
            );
            const orderStatus = orderByStatusLabel(parseISO(mostUrgent.order_by_date), today);

            return (
              <div key={`${run.occasionType}__${run.occasionDate}`} className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-x-[18px] gap-y-2 rounded-card border border-line bg-surface-2 px-[18px] py-[14px]">
                  <p className="font-sans text-row-label text-ink">
                    {person.personName} — {occasionTypeDisplayLabel(run.occasionType).toLowerCase()}
                  </p>
                  <p className="font-sans text-metadata text-meta">
                    {formatOccasionDate(occasionDate)} · {formatDaysRemaining(daysRemaining)}
                  </p>
                  <p className="font-sans text-metadata text-meta">
                    Budget ${(budget.minCents / 100).toFixed(0)}–${(budget.maxCents / 100).toFixed(0)}
                  </p>
                  <div className="flex min-w-[100px] items-center gap-2">
                    <div className="h-1.5 w-[100px] rounded-full bg-line">
                      <div className="h-full rounded-full bg-action" style={{ width: `${spendPercent}%` }} />
                    </div>
                    {/* D5: the bar's fill percent is computed against the
                        budget's max (see spendPercent above) but nothing
                        said so -- "$0 spent" alone left the bar's own
                        target ambiguous even with "Budget $25-$150" sitting
                        right next to it. Naming the max here ties the bar
                        directly to what it's actually filling toward. */}
                    <span className="font-sans text-metadata text-meta">
                      ${(spendCents / 100).toFixed(0)} of ${(budget.maxCents / 100).toFixed(0)} spent
                    </span>
                    {earmarkedCents > 0 && (
                      <span className="font-sans text-metadata text-ink-2 italic">
                        · ${(earmarkedCents / 100).toFixed(0)} earmarked
                      </span>
                    )}
                  </div>
                  {/* D4: urgency now lives here once, at the occasion
                      level, instead of being repeated on every card below
                      with the same "Needed now" wording. */}
                  <Badge variant={orderStatus.isPastDue ? "slipping" : "neutral"} className="ml-auto">
                    {orderStatus.label}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {run.suggestions.map((suggestion) => (
                    <GiftIdeaCard key={suggestion.id} suggestion={suggestion} />
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function GiftIdeaCard({ suggestion }: { suggestion: SuggestionWithStatus }) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-sans text-card-headline text-ink">{suggestion.title}</p>
        {/* D4: "HIGH/MID/LOW" named no axis -- this is price_tier, so say
            "Price" rather than leaving the reader to guess what's being
            rated (fit? quality? confidence?). */}
        <Badge variant="secondary">Price: {TIER_LABELS[suggestion.price_tier]}</Badge>
      </div>
      {/* D3: five lines of AI rationale used to always render in full on a
          save-or-dismiss surface. <details> collapses it to one line by
          default with no JS needed -- semantic, keyboard- and
          screen-reader-accessible out of the box. The full reasoning is
          identical open or closed; only how much of it shows changes. */}
      <details className="group">
        <summary className="cursor-pointer list-none">
          <span className="line-clamp-1 font-sans text-body text-ink-2 group-open:hidden">{suggestion.reasoning}</span>
          <span className="font-sans text-metadata font-bold text-action group-open:hidden">Why this?</span>
          <span className="hidden font-sans text-metadata font-bold text-action group-open:inline">Hide reasoning</span>
        </summary>
        <p className="mt-1 font-sans text-body text-ink-2">{suggestion.reasoning}</p>
      </details>
      <div className="flex items-center justify-between">
        <p className="font-serif text-[20px] leading-none text-ink">${(suggestion.estimated_cost_cents / 100).toFixed(0)}</p>
      </div>
      {suggestion.product_url && (
        <a
          href={suggestion.product_url}
          target="_blank"
          rel="noreferrer"
          className="font-sans text-metadata text-action underline underline-offset-2"
        >
          {/* P-07: only claim to search a specific retailer when the link
              genuinely goes to that retailer's own search page -- a saved
              site with no known search-URL pattern falls back to a plain
              Google search, and used to still say "Search on Fat Brain
              Toys" even though it silently searched Google instead. */}
          {isGenericWebSearchUrl(suggestion.product_url)
            ? `Search the web for ${suggestion.title}`
            : `Search on ${suggestion.retailer ?? "the web"}`}
        </a>
      )}
      <GiftSuggestionActions suggestionId={suggestion.id} status={suggestion.status} />
    </div>
  );
}

/** Real empty state for a group with no ideas (Part 2: "Groups with no
 * ideas get a real empty state that says what the system needs from the
 * user.") -- not currently reachable from either caller (both filter to
 * runs that already have suggestions), kept exported so a future caller
 * that lists occasions before suggestions exist can use it directly. */
export function EmptyGiftIdeas({ personName }: { personName: string }) {
  return (
    <EmptyState
      message={`No gift ideas yet for ${personName}. Suggestions generate automatically as this occasion gets closer, or open their profile to ask for ideas now.`}
    />
  );
}

/** P1-11: formats once here for the run sub-heading instead of leaking a
 * raw ISO date on every card. */
function formatOccasionDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

/** An occasion_date can be in the past -- suggestions stay active until
 * acted on even once the date itself has come and gone (e.g. a
 * just_because run generated around a birthday that's now a few days
 * behind), so this reads both directions instead of the misleading
 * negative-number "-13 days away" a naive template would show. */
function formatDaysRemaining(daysRemaining: number): string {
  if (daysRemaining === 0) return "today";
  if (daysRemaining > 0) return `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} away`;
  const daysAgo = Math.abs(daysRemaining);
  return `${daysAgo} day${daysAgo === 1 ? "" : "s"} ago`;
}
