import { addDays, format, formatDistanceToNow, startOfDay } from "date-fns";
import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarDays, Cloud, Compass, Gift, House, Mic, Users } from "lucide-react";
import { requireHouseholdContext } from "@/lib/auth/session";
import { getZonedNow } from "@/lib/timezones";
import { generateDailyBrief } from "@/lib/brief/generate";
import { isBriefStale } from "@/lib/brief/staleness";
import { isFeatureEnabled } from "@/lib/flags";
import { createSupabaseServiceRoleClient } from "@/lib/db/client-service-role";
import { usersRepo } from "@/lib/db/repositories/households";
import { briefsRepo, getBriefForPersonAndDate } from "@/lib/db/repositories/system";
import { listCustodyBlocksForHouseholdInRange, listEventsInRange } from "@/lib/db/repositories/calendar";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { listActiveCadencesForHousehold } from "@/lib/db/repositories/contact";
import { listActiveSuggestionsForHousehold } from "@/lib/db/repositories/gifts";
import { listOpenOpportunitiesWithSubjectForHousehold } from "@/lib/db/repositories/opportunities";
import { getPresentedOpportunities } from "@/lib/opportunities/present";
import { BRIEF_CONTRIBUTORS, composeBrief, itemsForCategory } from "@/lib/brief/contributors";
import { evaluateRhythm } from "@/lib/people/rhythm";
import { scanUpcomingOccasions, occasionTypeDisplayLabel } from "@/lib/gifts/occasions";
import { buildTodayPriorityItems, type PriorityItemKind } from "@/lib/brief/today-priority-items";
import { listActiveDismissalsForPerson } from "@/lib/db/repositories/today-dismissals";
import type { BriefContent } from "@/lib/brief/schema";
import { PriorityCard } from "@/components/ui/priority-card";
import { RailCard } from "@/components/ui/rail-card";
import { EmptyState } from "@/components/ui/empty-state";
import { RegenerateBriefButton } from "./regenerate-brief-button";
import { ReachOutCardActions, DecideCardActions, DinnerCardActions, QuickCardActions } from "./today-card-actions";

const RELATIONSHIP_BAR_LIMIT = 8;

// B4: one axis (source), not two -- People/Plan/Gifts/Household/Calendar
// predicts where a card's button goes, replacing the old
// REACH_OUT/DECIDE/QUICK badge stacked beside a second Suggestion/Gifts/
// Household label.
const SOURCE_META: Record<string, { variant: "slipping" | "custody-you" | "neutral"; icon: ReactNode }> = {
  People: { variant: "slipping", icon: <Users className="size-5" /> },
  Plan: { variant: "custody-you", icon: <Compass className="size-5" /> },
  Gifts: { variant: "neutral", icon: <Gift className="size-5" /> },
  Household: { variant: "neutral", icon: <House className="size-5" /> },
  Calendar: { variant: "neutral", icon: <CalendarDays className="size-5" /> },
};

// B5: reach-out cards are genuinely urgent (a coloured left rule, stronger
// fill); decide/opportunity cards stay a standard full card; quick items
// (gift/household/calendar heads-ups) drop the card chrome entirely and
// read as a quiet list, so urgency is visible in FORM, not just words.
const PRIORITY_BY_KIND: Record<PriorityItemKind, "urgent" | "standard" | "low"> = {
  reach_out: "urgent",
  decide: "standard",
  quick_headsup: "low",
  quick_household: "low",
  quick_household_dinner: "low",
};

export default async function BriefPage() {
  const { supabase, household, selfPerson, timezone } = await requireHouseholdContext();

  // D-143: household-local today, not a bare `new Date()` -- the server
  // runs in UTC, so an un-zoned reference date reads as tomorrow once the
  // user's local evening has passed midnight UTC.
  const today = getZonedNow(timezone);
  const todayDateStr = format(today, "yyyy-MM-dd");

  let brief = await getBriefForPersonAndDate(supabase, selfPerson.id, todayDateStr);
  if (!brief) {
    // briefs has no insert policy for regular users by design (only the
    // service role — the cron job — is allowed to write brief rows; see
    // migration 20260820000012). This on-demand fallback needs the same
    // elevated client to perform that first insert.
    const serviceRoleClient = createSupabaseServiceRoleClient();
    const result = await generateDailyBrief(serviceRoleClient, household.id, selfPerson.id, today);
    brief = await briefsRepo.getById(supabase, result.briefId);
  }

  const content = brief?.content_json as BriefContent | undefined;

  const viewerHasHomeAddress = selfPerson.user_id
    ? (await usersRepo.getById(supabase, selfPerson.user_id))?.home_lat != null
    : false;

  const householdPeople = await listPeopleForHousehold(supabase, household.id);
  const householdPeopleByName = new Map(householdPeople.map((p) => [p.full_name, p]));

  // D-061/P1-6/D-070: same threshold/dedupe/tiering the Opportunities page and Calendar nudge use.
  const rawOpportunities = await listOpenOpportunitiesWithSubjectForHousehold(supabase, household.id);
  const legacyTopOpportunities = getPresentedOpportunities(rawOpportunities).flat.slice(0, 2);

  const registrationV2 = await isFeatureEnabled(supabase, household.id, "brief_registration_v2");
  const composedItems = registrationV2
    ? composeBrief(
        (
          await Promise.all(
            BRIEF_CONTRIBUTORS.map((contributor) =>
              contributor({ supabase, householdId: household.id, personId: selfPerson.id, today })
            )
          )
        ).flat()
      )
    : [];
  const composedOpportunities = itemsForCategory(composedItems, "opportunities");
  const composedHousehold = itemsForCategory(composedItems, "household");
  const topOpportunities = registrationV2
    ? composedOpportunities.map((o) => ({ id: o.id, headline: o.title, reasoning: o.detail ?? "" }))
    : legacyTopOpportunities.map((o) => ({ id: o.id, headline: o.headline, reasoning: o.reasoning }));

  let isStale = false;
  if (brief && content) {
    const windowStart = startOfDay(today);
    const windowEnd = addDays(windowStart, 2);
    const [recentEvents, recentCustodyBlocks] = await Promise.all([
      listEventsInRange(supabase, household.id, windowStart.toISOString(), windowEnd.toISOString()),
      listCustodyBlocksForHouseholdInRange(supabase, household.id, windowStart.toISOString(), windowEnd.toISOString()),
    ]);
    isStale = isBriefStale(brief.generated_at, [...recentEvents, ...recentCustodyBlocks, ...householdPeople]);
  }

  // B7: "'Nothing in the next 90 days' -- but Settings sets the gift scan
  // horizon to 60, so the number is both arbitrary and inconsistent."
  // households.gift_scan_horizon_days is the one real setting (already used
  // by the Gifts feature itself) -- both the scan window and the number
  // shown to the household now read from it instead of a separate constant.
  const occasionHorizonDays = household.gift_scan_horizon_days;

  // Redesign right-rail data -- "Coming up" (Part 2): existing occasion-scan
  // logic (lib/gifts/occasions.ts, already used by the Gifts feature),
  // cross-referenced against existing active gift suggestions to show a
  // real ready/not-ready status per occasion, not new business logic.
  const [activeSuggestions, activeCadences] = await Promise.all([
    listActiveSuggestionsForHousehold(supabase, household.id),
    listActiveCadencesForHousehold(supabase, household.id),
  ]);
  const upcomingOccasions = scanUpcomingOccasions(householdPeople, today, occasionHorizonDays).slice(0, 4);
  const suggestionCountByPerson = new Map<string, number>();
  for (const s of activeSuggestions) {
    suggestionCountByPerson.set(s.person_id, (suggestionCountByPerson.get(s.person_id) ?? 0) + 1);
  }
  const peopleById = new Map(householdPeople.map((p) => [p.id, p]));

  // "Relationships holding" (Part 2): a household-level rollup over the
  // same cadence data and the same lib/people/rhythm.ts tiering the People
  // page's own rhythm column uses (Step 5) -- not a new tracked metric.
  const relationshipBars = activeCadences
    .map((c) => {
      const status = evaluateRhythm(c, today);
      const person = peopleById.get(c.person_id);
      return { personId: c.person_id, name: person?.nickname || person?.full_name || "Someone", tier: status.tier, healthPct: status.healthPct };
    })
    .filter((b) => b.personId)
    .slice(0, RELATIONSHIP_BAR_LIMIT);
  // B7: "'0 of 2 on track' ... never names the two people, and is phrased
  // as a failure." Name whoever's actually overdue instead of just a
  // count; only fall back to the count when nobody is (a positive state,
  // not worth naming).
  const overdueNames = relationshipBars.filter((b) => b.tier !== "settled").map((b) => b.name);
  const relationshipsSummary =
    relationshipBars.length === 0
      ? "No rhythms set up yet."
      : overdueNames.length === 0
        ? `All ${relationshipBars.length} on track.`
        : `${overdueNames.join(" and ")} ${overdueNames.length === 1 ? "is" : "are"} overdue for a check-in.`;

  // B2: items dismissed/snoozed by this viewer -- filtered out of the
  // priority stack below. Falls back to "nothing hidden" if the migration
  // adding this table hasn't been applied to this environment yet (see
  // QUESTIONS.md) rather than 500ing the whole page over a cosmetic
  // feature not being wired up yet.
  let dismissedItemIds = new Set<string>();
  try {
    dismissedItemIds = await listActiveDismissalsForPerson(supabase, selfPerson.id, todayDateStr);
  } catch (error) {
    console.error("Failed to load Today item dismissals (non-fatal):", error);
  }

  if (!content) {
    return (
      <div className="p-4">
        <p className="font-sans text-body text-ink-2">Couldn&apos;t generate today&apos;s brief. Try again shortly.</p>
      </div>
    );
  }

  const priorityItems = buildTodayPriorityItems({
    content,
    householdPeopleByName,
    opportunities: topOpportunities,
    household: composedHousehold.map((h) => ({ id: h.id, title: h.title, detail: h.detail ?? undefined, href: h.href ?? undefined })),
    dismissedItemIds,
  });
  const lowPriorityCount = Math.max(0, rawOpportunities.length - topOpportunities.length);

  const generatedAtLabel = brief ? formatDistanceToNow(new Date(brief.generated_at), { addSuffix: true }) : null;

  return (
    <div className="flex flex-col gap-[26px] xl:flex-row xl:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-[18px]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-sans text-metadata text-meta">
              {format(today, "EEEE, MMMM d")}
              {content.weather && ` · ${content.weather.summary}`}
            </p>
            <h1 className="font-serif text-headline text-ink text-pretty">{content.headline}</h1>
            {generatedAtLabel && <p className="mt-1 font-sans text-metadata text-meta">Updated {generatedAtLabel}</p>}
          </div>
          <RegenerateBriefButton />
        </div>

        {isStale && (
          <div className="flex items-start gap-2 rounded-input border border-slipping/30 bg-slipping-soft-bg px-3 py-2.5 font-sans text-body text-slipping-soft-fg">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>
              Your calendar or household info has changed since this brief was written — tap{" "}
              <span className="font-bold">Rebuild</span> above to update it.
            </p>
          </div>
        )}

        {/* Redesign Part 6 (768-1279px tier): "The right rail's content
            moves inline. On Today it becomes a horizontal row of two or
            three compact cards above the priority stack." Same data as
            the full right rail below (content.today / upcomingOccasions /
            relationshipBars), just condensed to one line each -- shown
            only below xl, where the full rail (further down this file) is
            hidden instead. */}
        <div className="flex flex-col gap-2 sm:flex-row xl:hidden">
          <div className="flex-1 rounded-card border border-line bg-surface px-4 py-3">
            <p className="font-sans text-section-label uppercase text-meta">Your day</p>
            <p className="mt-1 font-sans text-body text-ink">
              {content.today.length > 0
                ? `${content.today[0]!.time ?? "All day"} — ${content.today[0]!.title}${content.today.length > 1 ? ` +${content.today.length - 1} more` : ""}`
                : "Nothing else today."}
            </p>
          </div>
          <div className="flex-1 rounded-card border border-line bg-surface px-4 py-3">
            <p className="font-sans text-section-label uppercase text-meta">Coming up</p>
            <p className="mt-1 font-sans text-body text-ink">
              {upcomingOccasions.length > 0
                ? `${peopleById.get(upcomingOccasions[0]!.personId)?.nickname || peopleById.get(upcomingOccasions[0]!.personId)?.full_name} — ${occasionTypeDisplayLabel(upcomingOccasions[0]!.occasionType)}, ${format(upcomingOccasions[0]!.occasionDate, "MMM d")}`
                : `Nothing in the next ${occasionHorizonDays} days.`}
            </p>
          </div>
          <div className="flex-1 rounded-card border border-line bg-surface px-4 py-3">
            <p className="font-sans text-section-label uppercase text-meta">Relationships</p>
            <p className="mt-1 font-sans text-body text-ink">{relationshipsSummary}</p>
          </div>
        </div>

        {/* D-066: brain dump's other entry point, alongside the link inside
            the capture overlay. */}
        <Link href="/brain-dump">
          <div className="flex items-center gap-3 rounded-card border border-line bg-surface px-[22px] py-[15px] motion-safe-transition hover:border-line-strong">
            <Mic className="size-4 text-meta" />
            <div>
              <p className="font-sans text-body font-bold text-ink">Brain dump</p>
              <p className="font-sans text-metadata text-meta">Record a long note and I&apos;ll sort it into the right places</p>
            </div>
          </div>
        </Link>

        {priorityItems.length > 0 ? (
          <div className="flex flex-col gap-3">
            {priorityItems.map((item) => {
              const meta = SOURCE_META[item.source] ?? SOURCE_META.Household!;
              return (
                <PriorityCard
                  key={item.id}
                  icon={meta.icon}
                  tagLabel={item.source}
                  tagVariant={meta.variant}
                  metadata={item.metadata}
                  headline={item.headline}
                  detail={item.detail}
                  priority={PRIORITY_BY_KIND[item.kind]}
                  actions={
                    item.kind === "reach_out" ? (
                      <ReachOutCardActions itemKey={item.id} personId={item.personId} primaryAction={item.primaryAction} />
                    ) : item.kind === "decide" ? (
                      <DecideCardActions itemKey={item.id} opportunityId={item.opportunityId} primaryAction={item.primaryAction} />
                    ) : item.kind === "quick_household_dinner" ? (
                      <DinnerCardActions itemKey={item.id} primaryAction={item.primaryAction} />
                    ) : (
                      <QuickCardActions itemKey={item.id} primaryAction={item.primaryAction} />
                    )
                  }
                />
              );
            })}
          </div>
        ) : (
          <EmptyState message="Nothing needs you today. Everything is settled and the calendar is clear." />
        )}

        <p className="font-sans text-metadata text-meta">
          That is everything.{" "}
          {lowPriorityCount > 0
            ? `${lowPriorityCount} low-priority item${lowPriorityCount === 1 ? "" : "s"} ${lowPriorityCount === 1 ? "is" : "are"} waiting in Plan.`
            : "Nothing low-priority is waiting either."}
        </p>
      </div>

      <div className="hidden w-full flex-col gap-[18px] xl:flex xl:w-[342px] xl:shrink-0">
        <RailCard sectionLabel="Your day">
          {content.today.length > 0 ? (
            content.today.map((item, i) => (
              <div key={i} className="font-sans text-body">
                <span className="font-bold text-ink">{item.time ?? "All day"}</span>{" "}
                <span className="text-ink-2">— {item.title}</span>
                {item.note && <p className="font-sans text-metadata text-meta">{item.note}</p>}
              </div>
            ))
          ) : (
            <p className="font-sans text-body text-ink-2">Nothing else on the calendar for the rest of today.</p>
          )}
        </RailCard>

        <RailCard sectionLabel="Coming up">
          {upcomingOccasions.length > 0 ? (
            upcomingOccasions.map((occ, i) => {
              const person = peopleById.get(occ.personId);
              const suggestionCount = suggestionCountByPerson.get(occ.personId) ?? 0;
              return (
                <div key={i} className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-sans text-body font-bold text-ink">
                      {person?.nickname || person?.full_name} — {occasionTypeDisplayLabel(occ.occasionType)}
                    </p>
                    <p className="font-sans text-metadata text-meta">{format(occ.occasionDate, "MMM d")}</p>
                  </div>
                  <span className="font-sans text-metadata text-meta">
                    {suggestionCount > 0 ? `${suggestionCount} idea${suggestionCount === 1 ? "" : "s"}` : "No ideas yet"}
                  </span>
                </div>
              );
            })
          ) : (
            <p className="font-sans text-body text-ink-2">Nothing on the horizon in the next {occasionHorizonDays} days.</p>
          )}
        </RailCard>

        <RailCard sectionLabel="Relationships holding">
          {relationshipBars.length > 0 ? (
            <>
              <div className="flex h-12 items-end gap-1.5">
                {relationshipBars.map((bar) => (
                  <div
                    key={bar.personId}
                    title={bar.name}
                    className={`w-full rounded-[3px] ${
                      bar.tier === "slipping" ? "bg-slipping" : bar.tier === "warning" ? "bg-action" : "bg-settled"
                    }`}
                    style={{ height: `${Math.max(8, bar.healthPct)}%` }}
                  />
                ))}
              </div>
              <p className="font-sans text-body text-ink-2">{relationshipsSummary}</p>
            </>
          ) : (
            <p className="font-sans text-body text-ink-2">No contact rhythms set up yet.</p>
          )}
        </RailCard>

        {content.weather ? (
          <div className="flex items-center gap-2 font-sans text-metadata text-meta">
            <Cloud className="size-4" />
            {content.weather.summary}
            {content.weather.highF != null && ` · High ${Math.round(content.weather.highF)}°F`}
            {content.weather.lowF != null && ` · Low ${Math.round(content.weather.lowF)}°F`}
          </div>
        ) : (
          !viewerHasHomeAddress && (
            <div className="flex items-center gap-2 font-sans text-metadata text-meta">
              <Cloud className="size-4" />
              Add your home address under{" "}
              <Link href="/settings" className="underline-offset-2 hover:underline">
                Settings
              </Link>{" "}
              to see today&apos;s weather here.
            </div>
          )
        )}
      </div>
    </div>
  );
}
