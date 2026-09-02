// Daily brief orchestration (Section 8). Gathers every input listed in
// 8.2, computes travel/prep derivations (8.5), calls the AI for the
// structured brief (8.3), and falls back to the non-AI template (11.3)
// when AI is unavailable or over budget. Runs once per person per day.
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, format, isToday as dateIsToday, isTomorrow as dateIsTomorrow, startOfDay } from "date-fns";
import { AiBudgetExceededError, AiUnavailableError, callAi } from "../ai/client";
import { buildChildTokenMap } from "../ai/context";
import { parseAiJson } from "../ai/parse-json";
import {
  BRIEF_SYSTEM_PROMPT,
  buildBriefUserPrompt,
  briefAiResponseSchema,
  type BriefContextInput,
} from "../ai/prompts/brief";
import type { NotificationChannel, PersonRow } from "../db/database.types";
import { birthdayLeadTimeLabel, birthdaysToSurfaceInBrief } from "../calendar/birthdays";
import { listActivitiesWithLocations } from "../db/repositories/activities";
import { calendarEventsRepo, listCustodyBlocksForHouseholdInRange, listEventsInRange } from "../db/repositories/calendar";
import { listActiveCadencesForHousehold } from "../db/repositories/contact";
import { listSuggestionsDueForOrder } from "../db/repositories/gifts";
import { householdsRepo, usersRepo } from "../db/repositories/households";
import { listPeopleForHousehold, peopleRepo } from "../db/repositories/people";
import { briefsRepo, getBriefForPersonAndDate, getWeekendPlanForDate } from "../db/repositories/system";
import { getNwsForecast } from "../external/nws";
import { getTravelTime } from "../external/travel";
import { evaluateCadence, suppressCadencesSeenToday } from "../contact/cadence";
import { dispatchNotification } from "../notifications/dispatch";
import { filterActualCustodyTransitions } from "./custody-transitions";
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

  // --- Birthdays at a lead-time milestone or in the recent-past lookback (Section 8.2, P1-9) ---
  // birthdaysToSurfaceInBrief is fed householdPeople directly, so every result's
  // personId is guaranteed to be present in peopleById.
  const birthdays = birthdaysToSurfaceInBrief(householdPeople, todayStart).flatMap((b) => {
    const person = peopleById.get(b.personId);
    if (!person) return [];
    return [
      {
        personLabel: tokenMap.labelFor(person),
        age: b.age,
        daysUntil: b.daysUntil,
        timingLabel: birthdayLeadTimeLabel(b.daysUntil),
      },
    ];
  });

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
  // SECURITY (D-053): this previously called giftSuggestionsRepo.list()
  // with only a status/date filter and NO household_id scoping at all.
  // generateDailyBrief always runs on the service-role client (see the
  // callers in app/(app)/page.tsx and app/(app)/actions.ts), which
  // bypasses RLS entirely, so that query silently pulled gift_suggestions
  // rows from EVERY household in the database, not just this one — a
  // genuine cross-household data leak. Caught live: the seeded demo
  // household's "Carol Smith" gift suggestions were appearing on
  // Richard's real household's brief because both happened to have
  // suggestions with an order_by_date in the same 14-day window.
  // listSuggestionsDueForOrder() already existed as the correctly-scoped
  // version (inner-joins people.household_id) but wasn't being used here;
  // switched to it, then re-applied the original lower bound (>= today)
  // that the helper itself doesn't take as a parameter.
  const giftSuggestions = (await listSuggestionsDueForOrder(client, householdId, 14)).filter(
    (g) => g.order_by_date >= todayDateStr
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
  // D-048: suppress a nudge for anyone the user is already going to see
  // today — a custody handover (as the responsible parent or the child
  // themselves) or a today's-events companion via a related activity's
  // preferred_companions. Deliberately scoped to TODAY only, not tomorrow:
  // "you're seeing them today" shouldn't suppress a reminder that's still
  // useful to plan around for tomorrow.
  const todaysEvents = events.filter((e) => dateIsToday(new Date(e.starts_at)));
  const todaysCustodyBlocks = custodyBlocks.filter((c) => dateIsToday(new Date(c.starts_at)));
  const seenTodayPersonIds = new Set<string>();
  for (const block of todaysCustodyBlocks) {
    seenTodayPersonIds.add(block.child_person_id);
    seenTodayPersonIds.add(block.responsible_person_id);
  }
  for (const event of todaysEvents) {
    if (!event.related_activity_id) continue;
    const activity = activities.find((a) => a.id === event.related_activity_id);
    for (const companionId of activity?.preferred_companions ?? []) seenTodayPersonIds.add(companionId);
  }

  const overdueContacts = suppressCadencesSeenToday(
    cadenceRows
      .map((c) => ({ cadence: c, status: evaluateCadence(c, todayStart) }))
      .filter((c) => c.status.isOverdue)
      .map((c) => ({ personId: c.cadence.person_id, cadence: c.cadence, status: c.status })),
    seenTodayPersonIds
  ).map((c) => {
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
    // D-127: custodyBlocks itself comes from an *overlap* query (a block
    // spanning Fri 4:30pm -> Mon 8:30am overlaps every day in between), so
    // it must be narrowed to blocks whose handover actually starts inside
    // [windowStart, windowEnd) before being printed as "happening" —
    // otherwise a multi-day block gets re-announced at its original
    // handover time on every day it merely continues through.
    ...filterActualCustodyTransitions(custodyBlocks, windowStart, windowEnd).map((c) => {
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
    birthdays,
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
    // P3-5: in_app is always sent (it backs the notification bell itself);
    // everything beyond that is the household's own opt-in preference from
    // Settings, not a hardcoded literal. Dedup with a Set in case in_app was
    // ever stored in the preference array too.
    Array.from(new Set<NotificationChannel>(["in_app", ...household.notification_channels]))
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
