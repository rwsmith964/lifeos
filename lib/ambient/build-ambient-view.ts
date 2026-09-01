// Module 5 (Ambient Display Mode, D-121): read-only data aggregation for the
// wall-mounted-tablet route at app/ambient/page.tsx.
//
// Additive rule from the brief: "a new route rendering existing data
// read-only. Zero writes. No changes to the brief generator itself."
// Every call in this file is a plain SELECT through already-shipped,
// already-tested repository functions and pure helpers -- nothing here (or
// anything it calls transitively) performs an insert/update/upsert/delete.
//
// Deliberately does NOT call generateDailyBrief. That function itself
// writes a brief row (and can write to external_data_cache for a fresh
// weather lookup) when none exists yet for today -- exactly the kind of
// write this module must never trigger just by being *viewed*, unlike the
// main Brief page (app/(app)/page.tsx) which is allowed to generate
// on-demand because a person is actively there tapping through it. So on a
// day nothing has generated a brief yet (e.g. before the household's
// brief_time cron has fired), this returns briefAvailable: false and the
// route shows a plain "not generated yet" state instead of the headline
// items -- see QUEUE-019.
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, format, startOfDay } from "date-fns";
import type { BriefContent } from "../brief/schema";
import { getBriefForPersonAndDate } from "../db/repositories/system";
import { listEventsInRange } from "../db/repositories/calendar";
import { listPeopleForHousehold } from "../db/repositories/people";
import { listOpenOpportunitiesWithSubjectForHousehold } from "../db/repositories/opportunities";
import { getPresentedOpportunities } from "../opportunities/present";
import { scanUpcomingOccasions, occasionTypeDisplayLabel } from "../gifts/occasions";
import type { CalendarEventRow } from "../db/database.types";

/** "Today and the next few days" per the brief's verbatim scope. */
export const AMBIENT_UPCOMING_DAYS = 3;

// Occasions horizon for the ambient display specifically -- shorter than
// the gift engine's own household.gift_scan_horizon_days (typically 30-60,
// tuned for "start shopping now"), since this is a glanceable "what's
// coming up this week or two" surface, not a shopping-lead-time calculation.
export const AMBIENT_OCCASION_HORIZON_DAYS = 14;

// How many outstanding-item / occasion lines to show before "+N more" --
// a wall display has to stay glanceable, not become a scrolling list.
const MAX_LIST_ITEMS = 5;

export interface AmbientUpcomingOccasion {
  personName: string;
  occasionLabel: string;
  occasionDate: Date;
}

export interface AmbientView {
  householdName: string;
  generatedAt: string | null;
  headline: string | null;
  briefAvailable: boolean;
  todayItems: BriefContent["today"];
  headsUp: BriefContent["headsUp"];
  weather: BriefContent["weather"] | null;
  upcomingEvents: CalendarEventRow[];
  upcomingOccasions: AmbientUpcomingOccasion[];
  outstandingCount: number;
  outstandingHeadlines: string[];
  outstandingOverflow: number;
}

export async function buildAmbientView(
  client: SupabaseClient,
  householdId: string,
  householdName: string,
  selfPersonId: string,
  now: Date = new Date()
): Promise<AmbientView> {
  const todayDateStr = format(now, "yyyy-MM-dd");
  const windowStart = startOfDay(now);
  const windowEnd = addDays(windowStart, AMBIENT_UPCOMING_DAYS);

  const [brief, upcomingEvents, people, rawOpportunities] = await Promise.all([
    getBriefForPersonAndDate(client, selfPersonId, todayDateStr),
    listEventsInRange(client, householdId, windowStart.toISOString(), windowEnd.toISOString()),
    listPeopleForHousehold(client, householdId),
    listOpenOpportunitiesWithSubjectForHousehold(client, householdId, now),
  ]);

  const content = brief?.content_json as BriefContent | undefined;

  const nameById = new Map(people.map((p) => [p.id, p.full_name]));
  // QUEUE-019: scanUpcomingOccasions always includes a Christmas candidate
  // for every non-archived, non-self person (that's correct for the gift
  // engine, which needs a per-person shopping reminder) -- but surfaced
  // verbatim here it would repeat "Christmas" once per household member,
  // which is redundant noise on a glanceable wall display. Filtered down
  // to birthday/anniversary only for this view.
  const occasionCandidates = scanUpcomingOccasions(people, now, AMBIENT_OCCASION_HORIZON_DAYS).filter(
    (o) => o.occasionType !== "christmas"
  );
  const upcomingOccasions: AmbientUpcomingOccasion[] = occasionCandidates
    .slice(0, MAX_LIST_ITEMS)
    .map((o) => ({
      personName: nameById.get(o.personId) ?? "Someone",
      occasionLabel: occasionTypeDisplayLabel(o.occasionType),
      occasionDate: o.occasionDate,
    }));

  const outstanding = getPresentedOpportunities(rawOpportunities).flat;

  return {
    householdName,
    generatedAt: brief?.generated_at ?? null,
    headline: content?.headline ?? null,
    briefAvailable: Boolean(content),
    todayItems: content?.today ?? [],
    headsUp: content?.headsUp ?? [],
    weather: content?.weather ?? null,
    upcomingEvents,
    upcomingOccasions,
    outstandingCount: outstanding.length,
    outstandingHeadlines: outstanding.slice(0, MAX_LIST_ITEMS).map((o) => o.headline),
    outstandingOverflow: Math.max(0, outstanding.length - MAX_LIST_ITEMS),
  };
}
