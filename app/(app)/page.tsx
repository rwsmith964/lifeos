import { addDays, format, formatDistanceToNow, startOfDay } from "date-fns";
import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Cloud, Compass, Mic, Users, Zap } from "lucide-react";
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
import { buildTodayPriorityItems, type PriorityItem } from "@/lib/brief/today-priority-items";
import type { BriefContent } from "@/lib/brief/schema";
import { Button } from "@/components/ui/button";
import { PriorityCard } from "@/components/ui/priority-card";
import { RailCard } from "@/components/ui/rail-card";
import { EmptyState } from "@/components/ui/empty-state";
import { RegenerateBriefButton } from "./regenerate-brief-button";

const OCCASION_SCAN_HORIZON_DAYS = 90;
const RELATIONSHIP_BAR_LIMIT = 8;

const TAG_META: Record<PriorityItem["tag"], { label: string; variant: "slipping" | "custody-you" | "neutral"; icon: ReactNode }> = {
  reach_out: { label: "Reach out", variant: "slipping", icon: <Users className="size-5" /> },
  decide: { label: "Decide", variant: "custody-you", icon: <Compass className="size-5" /> },
  quick: { label: "Quick", variant: "neutral", icon: <Zap className="size-5" /> },
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

  // Redesign right-rail data -- "Coming up" (Part 2): existing occasion-scan
  // logic (lib/gifts/occasions.ts, already used by the Gifts feature),
  // cross-referenced against existing active gift suggestions to show a
  // real ready/not-ready status per occasion, not new business logic.
  const [activeSuggestions, activeCadences] = await Promise.all([
    listActiveSuggestionsForHousehold(supabase, household.id),
    listActiveCadencesForHousehold(supabase, household.id),
  ]);
  const upcomingOccasions = scanUpcomingOccasions(householdPeople, today, OCCASION_SCAN_HORIZON_DAYS).slice(0, 4);
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
  const settledCount = relationshipBars.filter((b) => b.tier === "settled").length;

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
              const meta = TAG_META[item.tag];
              return (
                <PriorityCard
                  key={item.id}
                  icon={meta.icon}
                  tagLabel={meta.label}
                  tagVariant={meta.variant}
                  metadata={item.metadata}
                  headline={item.headline}
                  detail={item.detail}
                  actions={
                    <>
                      <Button asChild size="sm">
                        <Link href={item.primaryAction.href}>{item.primaryAction.label}</Link>
                      </Button>
                      {item.ghostActions.map((action) => (
                        <Button key={action.href} asChild variant="ghost" size="sm">
                          <Link href={action.href}>{action.label}</Link>
                        </Button>
                      ))}
                    </>
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

      <div className="flex w-full flex-col gap-[18px] xl:w-[342px] xl:shrink-0">
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
            <p className="font-sans text-body text-ink-2">Nothing on the horizon in the next {OCCASION_SCAN_HORIZON_DAYS} days.</p>
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
              <p className="font-sans text-body text-ink-2">
                {settledCount} of {relationshipBars.length} relationships on track.
              </p>
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
