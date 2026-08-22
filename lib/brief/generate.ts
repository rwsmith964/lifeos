// Daily brief orchestration (Section 8). Gathers every input listed in
// 8.2, computes travel/prep derivations (8.5), calls the AI for the
// structured brief (8.3), and falls back to the non-AI template (11.3)
// when AI is unavailable or over budget. Runs once per person per day.
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, format, isTomorrow as dateIsTomorrow, startOfDay } from "date-fns";
import { AiBudgetExceededError, AiUnavailableError, callAi } from "../ai/client";
import { buildChildTokenMap } from "../ai/context";
import { parseAiJson } from "../ai/parse-json";
import {
  BRIEF_SYSTEM_PROMPT,
  buildBriefUserPrompt,
  briefAiResponseSchema,
  type BriefContextInput,
} from "../ai/prompts/brief";
import type { PersonRow } from "../db/database.types";
import { listActivitiesWithLocations } from "../db/repositories/activities";
import { calendarEventsRepo, listCustodyBlocksForHouseholdInRange, listEventsInRange } from "../db/repositories/calendar";
import { listActiveCadencesForHousehold } from "../db/repositories/contact";
import { giftSuggestionsRepo } from "../db/repositories/gifts";
import { householdsRepo, usersRepo } from "../db/repositories/households";
import { listPeopleForHousehold, peopleRepo } from "../db/repositories/people";
import { briefsRepo, getBriefForPersonAndDate, getWeekendPlanForDate } from "../db/repositories/system";
import { getNwsForecast } from "../external/nws";
import { getTravelTime } from "../external/travel";
import { evaluateCadence } from "../contact/cadence";
import { dispatchNotification } from "../notifications/dispatch";
import { computePrepObligations, computeTravelLegs } from "./prep";
import { renderBriefMarkdown } from "./render";
import { buildTemplatedBriefContent } from "./template-fallback";
import type { BriefContent } from "./schema";

export type GenerateBriefResult =
  | { status: "generated"; briefId: string; contentMarkdown: string }
  | { status: "already_exists"; briefId: string; contentMarkdown: string };

export async function generateDailyBrief(
  client: SupabaseClient,
  householdId: string,
  forPersonId: string,
  today: Date = new Date()
): Promise<GenerateBriefResult> {
  const todayStart = startOfDay(today);
  const todayDateStr = format(todayStart, "yyyy-MM-dd");

  const existing = await getBriefForPersonAndDate(client, forPersonId, todayDateStr);
  if (existing) {
    return { status: "already_exists", briefId: existing.id, contentMarkdown: existing.content_markdown };
  }

  const [household, person, owner] = await Promise.all([
    householdsRepo.getById(client, householdId),
    peopleRepo.getById(client, forPersonId),
    findHouseholdOwnerUser(client, householdId),
  ]);
  if (!household) throw new Error(`Household ${householdId} not found`);
  if (!person) throw new Error(`Person ${forPersonId} not found`);

  const windowStart = todayStart;
  const windowEnd = addDays(todayStart, 2); // today + tomorrow

  const [events, custodyBlocks, cadenceRows, householdPeople] = await Promise.all([
    listEventsInRange(client, householdId, windowStart.toISOString(), windowEnd.toISOString()),
    listCustodyBlocksForHouseholdInRange(client, householdId, windowStart.toISOString(), windowEnd.toISOString()),
    listActiveCadencesForHousehold(client, householdId),
    listPeopleForHousehold(client, householdId),
  ]);

  const tokenMap = buildChildTokenMap(householdPeople);
  const peopleById = new Map(householdPeople.map((p) => [p.id, p]));

  // --- Travel times (Section 8.5) ------------------------------------
  const home = owner?.home_lat != null && owner?.home_lng != null ? { lat: owner.home_lat, lng: owner.home_lng } : null;
  if (home) {
    const legs = computeTravelLegs(
      events.map((e) => ({
        id: e.id,
        startsAt: new Date(e.starts_at),
        locationLat: e.location_lat,
        locationLng: e.location_lng,
      })),
      home
    );
    for (const leg of legs) {
      const result = await getTravelTime(leg.from, leg.to, {});
      await calendarEventsRepo.update(client, leg.eventId, { travel_time_before_minutes: result.minutes });
    }
  }

  // --- Prep obligations for tomorrow (Section 8.5) --------------------
  const activities = await listActivitiesWithLocations(client, householdId);
  const activitiesById = new Map(
    activities.map((a) => [a.id, { id: a.id, requiresPrep: a.requires_prep, prepLeadTimeHours: a.prep_lead_time_hours }])
  );
  const tomorrowEvents = events.filter((e) => dateIsTomorrow(new Date(e.starts_at)));
  const prepObligations = computePrepObligations(
    tomorrowEvents.map((e) => ({ id: e.id, startsAt: new Date(e.starts_at), relatedActivityId: e.related_activity_id })),
    activitiesById
  );

  // --- Gift order-by reminders within 14 days (Section 8.2) -----------
  const giftSuggestions = await giftSuggestionsRepo.list(client, (q) =>
    q
      .in("status", ["suggested", "saved"])
      .lte("order_by_date", format(addDays(todayStart, 14), "yyyy-MM-dd"))
      .gte("order_by_date", todayDateStr)
  );
  const giftReminders = await Promise.all(
    giftSuggestions.map(async (g) => {
      const recipient = peopleById.get(g.person_id) ?? (await peopleRepo.getById(client, g.person_id));
      const label = recipient ? tokenMap.labelFor(recipient) : "someone";
      const days = Math.round((new Date(g.order_by_date).getTime() - todayStart.getTime()) / 86_400_000);
      return {
        personLabel: label,
        occasionType: g.occasion_type,
        occasionDate: g.occasion_date,
        orderByDate: g.order_by_date,
        daysUntilOrderBy: days,
      };
    })
  );

  // --- Overdue contact cadences ----------------------------------------
  const overdueContacts = cadenceRows
    .map((c) => ({ cadence: c, status: evaluateCadence(c, todayStart) }))
    .filter((c) => c.status.isOverdue)
    .map((c) => {
      const contactPerson = peopleById.get(c.cadence.person_id);
      const matchingActivity = activities.find((a) => a.preferred_companions.includes(c.cadence.person_id));
      return {
        personLabel: contactPerson ? tokenMap.labelFor(contactPerson) : "someone",
        daysSinceLastContact: c.status.daysSinceLastContact,
        activityType: matchingActivity?.activity_type ?? null,
      };
    });

  // --- Weather -----------------------------------------------------------
  let weather: BriefContextInput["weather"] = null;
  if (home) {
    const forecast = await getNwsForecast(client, home.lat, home.lng);
    const period = forecast.data?.periods[0];
    if (period) {
      weather = { summary: period.shortForecast, highF: period.temperatureF, lowF: null };
    }
  }

  // --- Weekend plan mention (Wed-Fri only) --------------------------------
  const dayOfWeek = todayStart.getDay(); // 0=Sun..6=Sat
  const isWedThroughFri = dayOfWeek >= 3 && dayOfWeek <= 5;
  let weekendPlanSummary: string | null = null;
  if (isWedThroughFri) {
    const daysUntilSaturday = (6 - dayOfWeek + 7) % 7;
    const saturday = format(addDays(todayStart, daysUntilSaturday), "yyyy-MM-dd");
    const plan = await getWeekendPlanForDate(client, householdId, saturday);
    if (plan) weekendPlanSummary = plan.content_markdown;
  }

  const eventContexts: BriefContextInput["events"] = [
    ...events.map((e) => ({
      time: e.all_day ? null : format(new Date(e.starts_at), "h:mm a"),
      title: e.title,
      eventType: e.event_type,
      travelNote: e.travel_time_before_minutes != null ? `${e.travel_time_before_minutes} min drive` : null,
      isTomorrow: dateIsTomorrow(new Date(e.starts_at)),
    })),
    // Section 8.2: "today's and tomorrow's calendar_events ... including
    // custody blocks" — custody_blocks is a separate table, folded in here
    // as pseudo-events so the brief treats them the same as any other item.
    ...custodyBlocks.map((c) => {
      const child = peopleById.get(c.child_person_id);
      const responsible = peopleById.get(c.responsible_person_id);
      const childLabel = child ? tokenMap.labelFor(child) : "child";
      const responsibleLabel = responsible ? tokenMap.labelFor(responsible) : "co-parent";
      return {
        time: format(new Date(c.starts_at), "h:mm a"),
        title: `Custody: ${childLabel} with ${responsibleLabel} (${c.block_type})`,
        eventType: "custody",
        travelNote: null,
        isTomorrow: dateIsTomorrow(new Date(c.starts_at)),
      };
    }),
  ];

  const context: BriefContextInput = {
    todayLabel: format(todayStart, "EEEE, MMMM d"),
    events: eventContexts,
    giftReminders,
    overdueContacts,
    prepObligations: prepObligations.map((p) => ({
      activityTitle: activities.find((a) => a.id === p.activityId)?.activity_type ?? "activity",
      prepAtLabel: format(p.prepAt, "EEEE h:mm a"),
    })),
    weather,
    weekendPlanSummary,
  };

  let content: BriefContent | null = null;

  try {
    const result = await callAi(client, {
      householdId,
      feature: "daily_brief",
      systemPrompt: BRIEF_SYSTEM_PROMPT,
      userPrompt: buildBriefUserPrompt(context),
      maxTokens: 1536,
    });
    const parsed = parseAiJson(result.text);
    if (parsed.success) {
      const validated = briefAiResponseSchema.safeParse(parsed.data);
      if (validated.success) {
        content = validated.data;
      }
    }
  } catch (error) {
    if (!(error instanceof AiUnavailableError) && !(error instanceof AiBudgetExceededError)) throw error;
  }

  if (!content) {
    content = buildTemplatedBriefContent(context);
  }

  // Restore any child-name tokens the AI echoed back before rendering/storing.
  const restoredContent: BriefContent = JSON.parse(tokenMap.restoreRealNames(JSON.stringify(content)));
  const markdown = renderBriefMarkdown(restoredContent);

  const brief = await briefsRepo.create(client, {
    household_id: householdId,
    for_person_id: forPersonId,
    brief_date: todayDateStr,
    content_json: restoredContent,
    content_markdown: markdown,
    delivered_channels: [],
  });

  const delivered = await dispatchNotification(
    client,
    {
      householdId,
      personId: forPersonId,
      notificationType: "daily_brief",
      title: restoredContent.headline,
      body: markdown,
      linkPath: `/brief/${todayDateStr}`,
    },
    ["in_app", "email"]
  );
  await briefsRepo.update(client, brief.id, {
    delivered_channels: delivered.filter((d) => d.result.delivered).map((d) => d.channel),
  });

  return { status: "generated", briefId: brief.id, contentMarkdown: markdown };
}

async function findHouseholdOwnerUser(client: SupabaseClient, householdId: string) {
  const people = await peopleRepo.list(client, (q) =>
    q.eq("household_id", householdId).eq("relationship_type", "self").limit(1)
  );
  const self: PersonRow | undefined = people[0];
  if (!self?.user_id) return null;
  return usersRepo.getById(client, self.user_id);
}
