import Link from "next/link";
import { CloudLightning, Pencil } from "lucide-react";
import { format, parseISO } from "date-fns";
import { requireHouseholdContext } from "@/lib/auth/session";
import { getZonedNow } from "@/lib/timezones";
import { listActivitiesWithLocations } from "@/lib/db/repositories/activities";
import { listTripIdeasForHousehold } from "@/lib/db/repositories/trip-ideas";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { listCustodyBlocksForHouseholdInRange } from "@/lib/db/repositories/calendar";
import { seasonWindowLabel } from "@/lib/planner/month-names";
import { isFeatureEnabled } from "@/lib/flags";
import { usersRepo } from "@/lib/db/repositories/households";
import { peopleRepo } from "@/lib/db/repositories/people";
import {
  listAllTypeGearChecklistDefaultsForHousehold,
  listViabilityConfigsForHousehold,
} from "@/lib/db/repositories/leisure-planner";
import { listOpenOpportunitiesWithSubjectForHouseholdInDateRange } from "@/lib/db/repositories/opportunities";
import { getPresentedOpportunities } from "@/lib/opportunities/present";
import { getNwsForecast } from "@/lib/external/nws";
import { scoreWeatherSuitability, parseWindMph } from "@/lib/planner/weather-score";
import { getWeekendPlanForDate } from "@/lib/db/repositories/system";
import { listMealPlansForRange, listRecipesForHousehold } from "@/lib/db/repositories/household";
import { Card, CardContent } from "@/components/ui/card";
import { RailCard } from "@/components/ui/rail-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DeactivateActivityButton } from "./deactivate-button";
import { MarkDoneButton } from "./mark-done-button";
import { TripIdeasSection } from "./trip-ideas-section";
import { GenerateWeekendPlanButton } from "../calendar/generate-weekend-plan-button";
import { AcceptWeekendPlanButton } from "../calendar/accept-weekend-plan-button";
import { PlanProposalCard } from "./plan-proposal-card";
import {
  AddTypeGearChecklistItemForm,
  AddViabilityConfigForm,
  TypeGearChecklistItemRow,
  ViabilityConfigRow,
} from "./leisure-planner-forms";

const DAY_PARAM_FORMAT = "yyyy-MM-dd";
const WEEK_DAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export default async function PlanPage() {
  const { supabase, household, timezone } = await requireHouseholdContext();
  const now = getZonedNow(timezone);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const daysUntilSaturday = (6 - today.getDay() + 7) % 7;
  const saturday = new Date(today.getTime() + daysUntilSaturday * 86400000);
  const sunday = new Date(saturday.getTime() + 86400000);
  const saturdayKey = format(saturday, DAY_PARAM_FORMAT);
  const sundayKey = format(sunday, DAY_PARAM_FORMAT);

  const [activities, tripIdeas, people] = await Promise.all([
    listActivitiesWithLocations(supabase, household.id),
    listTripIdeasForHousehold(supabase, household.id),
    listPeopleForHousehold(supabase, household.id),
  ]);

  const plannerEnabled = await isFeatureEnabled(supabase, household.id, "leisure_planner_v2");
  const householdEnabled = await isFeatureEnabled(supabase, household.id, "household_layer");
  const [viabilityConfigs, typeGearDefaults] = plannerEnabled
    ? await Promise.all([
        listViabilityConfigsForHousehold(supabase, household.id),
        listAllTypeGearChecklistDefaultsForHousehold(supabase, household.id),
      ])
    : [[], []];
  const activityTypeSuggestions = Array.from(new Set(activities.map((a) => a.activity_type.toLowerCase())));
  const typeGearDefaultsByType = new Map<string, typeof typeGearDefaults>();
  for (const item of typeGearDefaults) {
    const key = item.activity_type_key ?? "";
    typeGearDefaultsByType.set(key, [...(typeGearDefaultsByType.get(key) ?? []), item]);
  }

  // Redesign (Part 2 — Plan): the scored-proposal list reuses the existing
  // opportunity-detection engine (D-061/D-070) -- the same real, already-
  // computed per-candidate score the Opportunities page and Calendar's
  // weekend nudge already show, not a new scoring system built for this
  // page.
  const rawWeekendOpportunities = await listOpenOpportunitiesWithSubjectForHouseholdInDateRange(
    supabase,
    household.id,
    saturdayKey,
    sundayKey
  );
  const { byDay: opportunitiesByDay } = getPresentedOpportunities(rawWeekendOpportunities);
  const opportunitiesByDate = new Map(opportunitiesByDay.map((d) => [d.forDate, d.opportunities]));

  // Custody state for the weekend header ("kids with you until Saturday 4
  // PM", matching the reference image), reusing the same query Calendar uses.
  const custodyBlocks = await listCustodyBlocksForHouseholdInRange(
    supabase,
    household.id,
    today.toISOString(),
    new Date(sunday.getTime() + 86400000).toISOString()
  );
  const peopleById = new Map(people.map((p) => [p.id, p.nickname || p.full_name]));
  const custodyOnSaturday = custodyBlocks.find(
    (c) => new Date(c.starts_at) <= saturday && new Date(c.ends_at) > saturday
  );
  const custodyStateLabel = custodyOnSaturday
    ? `Kids with ${peopleById.get(custodyOnSaturday.responsible_person_id) ?? "someone"}${
        new Date(custodyOnSaturday.ends_at) < sunday ? ` until ${format(new Date(custodyOnSaturday.ends_at), "h:mm a")}` : ""
      }`
    : null;

  // Weather banner: real NWS forecast, same adapter/scoring already used
  // on Calendar's week view and the weekend-plan generator itself.
  let weatherBanner: { headline: string; detail: string } | null = null;
  try {
    const selfPeople = await peopleRepo.list(supabase, (q) =>
      q.eq("household_id", household.id).eq("relationship_type", "self").limit(1)
    );
    const owner = selfPeople[0]?.user_id ? await usersRepo.getById(supabase, selfPeople[0].user_id) : null;
    if (owner?.home_lat != null && owner?.home_lng != null) {
      const forecast = await getNwsForecast(supabase, owner.home_lat, owner.home_lng);
      const period = forecast.data?.periods.find((p) => {
        const d = new Date(p.startTime);
        return (d >= saturday && d < sunday) || (d >= sunday && d < new Date(sunday.getTime() + 86400000));
      });
      if (period) {
        const score = scoreWeatherSuitability({
          tempF: period.temperatureF,
          precipChancePercent: period.precipitationChancePercent,
          windMph: parseWindMph(period.windSpeed),
        });
        if (score < 40) {
          const ruledOut = activities.filter((a) => a.typical_drive_minutes == null || a.locations.length === 0).length;
          weatherBanner = {
            headline: `${period.shortForecast}${period.precipitationChancePercent != null ? `, ${period.precipitationChancePercent}% chance of rain` : ""}.`,
            detail:
              activities.length > 0
                ? `${activities.length - ruledOut} of your ${activities.length} activities may need dry weather.`
                : "Check the forecast before planning anything outdoors.",
          };
        }
      }
    }
  } catch (error) {
    console.error("Plan page: weather banner fetch failed (non-fatal):", error);
  }

  const weekendPlan = await getWeekendPlanForDate(supabase, household.id, saturdayKey);

  // "Dinners this week" strip (Part 2), only when Module 7 is on --
  // reuses the existing meal-plan data/queries, not new business logic.
  let dinnersThisWeek: { date: Date; label: string | null }[] = [];
  if (householdEnabled) {
    const weekStart = new Date(today.getTime() - today.getDay() * 86400000);
    const weekEnd = new Date(weekStart.getTime() + 6 * 86400000);
    const [mealPlans, recipes] = await Promise.all([
      listMealPlansForRange(supabase, household.id, format(weekStart, DAY_PARAM_FORMAT), format(weekEnd, DAY_PARAM_FORMAT)),
      listRecipesForHousehold(supabase, household.id),
    ]);
    const recipeTitleById = new Map(recipes.map((r) => [r.id, r.title]));
    const dinnersByDate = new Map(
      mealPlans.filter((m) => m.meal_slot === "dinner").map((m) => [m.planned_date, m.custom_meal_name ?? (m.recipe_id ? recipeTitleById.get(m.recipe_id) : null) ?? null])
    );
    dinnersThisWeek = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(weekStart.getTime() + i * 86400000);
      return { date, label: dinnersByDate.get(format(date, DAY_PARAM_FORMAT)) ?? null };
    });
  }
  const dinnersPlannedCount = dinnersThisWeek.filter((d) => d.label).length;

  return (
    <div className="flex flex-col gap-[18px] xl:flex-row xl:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-[18px]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-page-title text-ink">This weekend</h1>
            <p className="mt-1 font-sans text-body text-ink-2">
              {format(saturday, "MMMM d")} – {format(sunday, "d, yyyy")}
              {custodyStateLabel && ` · ${custodyStateLabel}`}
            </p>
          </div>
          <div className="flex gap-2">
            {weekendPlan ? (
              <GenerateWeekendPlanButton variant="regenerate" />
            ) : (
              <GenerateWeekendPlanButton />
            )}
          </div>
        </div>

        {weatherBanner && (
          <div className="flex items-center justify-between gap-3 rounded-card border border-slipping/30 bg-slipping-soft-bg px-[18px] py-3">
            <div className="flex items-center gap-3">
              <CloudLightning className="size-5 shrink-0 text-slipping-soft-fg" />
              <div>
                <p className="font-sans text-body font-bold text-slipping-soft-fg">{weatherBanner.headline}</p>
                <p className="font-sans text-metadata text-slipping-soft-fg/80">{weatherBanner.detail}</p>
              </div>
            </div>
          </div>
        )}

        {weekendPlan && !weekendPlan.accepted_at && weekendPlan.recommended_activity_id && weekendPlan.recommended_block_start && (
          <Card>
            <CardContent className="flex items-center justify-between gap-2">
              <p className="font-sans text-body text-ink-2">LifeOS has a suggested plan for this weekend.</p>
              <AcceptWeekendPlanButton />
            </CardContent>
          </Card>
        )}

        {([
          { label: "Saturday", date: saturday, dateKey: saturdayKey, custodyLabel: custodyStateLabel },
          {
            label: "Sunday",
            date: sunday,
            dateKey: sundayKey,
            custodyLabel: (() => {
              const c = custodyBlocks.find((c) => new Date(c.starts_at) <= sunday && new Date(c.ends_at) > sunday);
              return c ? `Kids with ${peopleById.get(c.responsible_person_id) ?? "someone"}` : null;
            })(),
          },
        ] as const).map((day) => {
          const dayOpportunities = opportunitiesByDate.get(day.dateKey) ?? [];
          return (
            <div key={day.dateKey} className="flex flex-col gap-2">
              <p className="font-sans text-section-label uppercase text-meta">
                {day.label}
                {day.custodyLabel && <span className="ml-2 normal-case text-ink-2">{day.custodyLabel}</span>}
              </p>
              {dayOpportunities.length > 0 ? (
                dayOpportunities.map((opp) => <PlanProposalCard key={opp.id} opportunity={opp} dayLabel={day.label} />)
              ) : (
                <EmptyState message={`Nothing stands out for ${day.label.toLowerCase()} yet — check back closer to the date, or add more activities.`} />
              )}
            </div>
          );
        })}

        {householdEnabled && (
          <RailCard sectionLabel="Dinners this week">
            <div className="flex items-center justify-between">
              <div className="grid flex-1 grid-cols-7 gap-2">
                {dinnersThisWeek.map((d, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <p className="font-sans text-[10px] font-bold uppercase text-meta">{WEEK_DAY_LABELS[i]}</p>
                    <p className={d.label ? "font-sans text-metadata font-bold text-ink" : "font-sans text-metadata text-meta"}>
                      {d.label ?? "—"}
                    </p>
                  </div>
                ))}
              </div>
              <span className="ml-3 shrink-0 font-sans text-metadata text-meta">{dinnersPlannedCount} of 7 planned</span>
            </div>
          </RailCard>
        )}
      </div>

      <div className="flex w-full flex-col gap-[18px] xl:w-[342px] xl:shrink-0">
        <RailCard sectionLabel="Your activities">
          {activities.length === 0 ? (
            <EmptyState message="No activities yet. Add a hobby (golf, fishing, hiking, gym…) so the weekend planner has something to score." />
          ) : (
            <div className="flex flex-col gap-3">
              {activities.map((activity) => {
                const liveOpportunity = rawWeekendOpportunities.find((o) => o.activity_id === activity.id);
                return (
                  <div key={activity.id} className="flex flex-col gap-1 border-b border-line pb-3 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-sans text-body font-bold text-ink">{activity.activity_type}</p>
                        <p className="font-sans text-metadata text-meta">
                          Enjoyment {activity.enjoyment_rank}/10 · {activity.typical_duration_minutes} min
                        </p>
                      </div>
                      {liveOpportunity ? (
                        <span className="font-serif text-[17px] text-action">{liveOpportunity.score}</span>
                      ) : (
                        <span className="font-sans text-metadata text-meta">not scored</span>
                      )}
                    </div>
                    {activity.locations.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {activity.locations.map((location) => (
                          <Badge key={location.id} variant="outline">
                            {location.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {(activity.season_start_month != null || activity.needs_daylight) && (
                      <div className="flex flex-wrap gap-1">
                        {activity.season_start_month != null && activity.season_end_month != null && (
                          <Badge variant="secondary">Season: {seasonWindowLabel(activity.season_start_month, activity.season_end_month)}</Badge>
                        )}
                        {activity.needs_daylight && <Badge variant="secondary">Needs daylight</Badge>}
                      </div>
                    )}
                    <p className="font-sans text-metadata text-meta">
                      {activity.last_done_at ? `Last done ${format(parseISO(activity.last_done_at), "MMM d")}` : "Not logged as done yet"}
                    </p>
                    <div className="flex items-center gap-1 pt-1">
                      <MarkDoneButton activityId={activity.id} />
                      <Button asChild size="icon" variant="ghost">
                        <Link href={`/activities/${activity.id}/edit`} aria-label="Edit activity">
                          <Pencil className="size-4" />
                        </Link>
                      </Button>
                      <DeactivateActivityButton activityId={activity.id} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <Button asChild size="sm" variant="ghost" className="mt-2 border border-dashed border-line-strong">
            <Link href="/activities/new">+ Add an activity</Link>
          </Button>
        </RailCard>

        <RailCard sectionLabel="How scoring works">
          <p className="font-sans text-body text-ink-2">
            Enjoyment rank, weather fit, drive time, how long since you last did it, and who is free. Weights live in
            the activity type settings below.
          </p>
        </RailCard>

        {plannerEnabled && (
          <RailCard sectionLabel="Activity type settings">
            <div className="flex flex-col gap-2">
              <p className="font-sans text-metadata font-bold text-ink-2">Viability configs</p>
              {viabilityConfigs.length === 0 ? (
                <p className="font-sans text-body text-ink-2">No viability configs yet.</p>
              ) : (
                viabilityConfigs.map((config) => <ViabilityConfigRow key={config.id} config={config} />)
              )}
              <AddViabilityConfigForm activityTypeSuggestions={activityTypeSuggestions} />
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <p className="font-sans text-metadata font-bold text-ink-2">Default gear checklists</p>
              {typeGearDefaultsByType.size === 0 ? (
                <p className="font-sans text-body text-ink-2">No default gear items yet.</p>
              ) : (
                Array.from(typeGearDefaultsByType.entries()).map(([type, items]) => (
                  <div key={type} className="flex flex-col gap-1">
                    <p className="font-sans text-metadata font-bold text-ink">{type.length > 0 ? type[0].toUpperCase() + type.slice(1) : type}</p>
                    {items.map((item) => (
                      <TypeGearChecklistItemRow key={item.id} item={item} />
                    ))}
                  </div>
                ))
              )}
              <AddTypeGearChecklistItemForm activityTypeSuggestions={activityTypeSuggestions} />
            </div>
          </RailCard>
        )}

        <RailCard sectionLabel="Trip ideas">
          <TripIdeasSection tripIdeas={tripIdeas} people={people} />
        </RailCard>
      </div>
    </div>
  );
}
