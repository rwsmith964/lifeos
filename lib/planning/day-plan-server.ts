// One turn of the "plan my day" conversation. The AI settles order and
// durations; this turns an agreed plan into a real schedule: who "Dad's" is,
// where each stop is, how long the drives take, what time everything happens,
// and which kids are along. Read-only: nothing is saved until the person
// confirms (see app/(app)/plan-day/actions.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import { endOfDay, format, startOfDay } from "date-fns";
import { AiBudgetExceededError, AiUnavailableError, callAi } from "../ai/client";
import { buildChildTokenMap } from "../ai/context";
import { parseAiJson } from "../ai/parse-json";
import {
  buildDayPlanUserPrompt,
  DAY_PLAN_SYSTEM_PROMPT,
  dayPlanResponseSchema,
  type DayPlanMessage,
} from "../ai/prompts/day-plan";
import { listCustodyBlocksForHouseholdInRange } from "../db/repositories/calendar";
import { usersRepo } from "../db/repositories/households";
import { listPeopleForHousehold } from "../db/repositories/people";
import type { PersonRow } from "../db/database.types";
import { geocodeAddress } from "../external/geocode";
import { getTravelTime } from "../external/travel";
import {
  atClockTime,
  buildTimeline,
  mealWindowsCrossed,
  resolvePersonReference,
  roundUpToFive,
} from "./day-plan";

export interface DayPlanProposalStop {
  key: string;
  name: string;
  personId: string | null;
  personName: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  durationMinutes: number;
  driveMinutes: number;
  /** Naive local "yyyy-MM-ddTHH:mm:ss" wall-clock values (calendar times are floating). */
  departLocal: string;
  arriveLocal: string;
  leaveLocal: string;
  notes: string | null;
}

export interface DayPlanProposal {
  stops: DayPlanProposalStop[];
  childPersonIds: string[];
  /** True when the drive to the first stop couldn't be estimated (no home address). */
  homeUnknown: boolean;
}

export type DayPlanTurnResult =
  | { status: "asking"; message: string }
  | { status: "proposal"; message: string; proposal: DayPlanProposal }
  | { status: "unavailable" | "error"; message: string };

const LOCAL = "yyyy-MM-dd'T'HH:mm:ss";
const GEOCODE_GAP_MS = 1100;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runDayPlanTurn(
  supabase: SupabaseClient,
  ctx: { householdId: string; selfPerson: PersonRow; userId: string; timezone: string; now: Date },
  messages: DayPlanMessage[]
): Promise<DayPlanTurnResult> {
  const { householdId, selfPerson, now } = ctx;
  const people = await listPeopleForHousehold(supabase, householdId);
  const tokenMap = buildChildTokenMap(people);

  const home = await usersRepo.getById(supabase, ctx.userId).catch(() => null);
  const homePoint = home?.home_lat != null && home?.home_lng != null ? { lat: home.home_lat, lng: home.home_lng } : null;

  const children = people.filter((p) => p.relationship_type === "child" && !p.is_archived);
  const custody = await listCustodyBlocksForHouseholdInRange(
    supabase,
    householdId,
    startOfDay(now).toISOString(),
    endOfDay(now).toISOString()
  ).catch(() => []);
  const kidsWithMe = children.filter((c) =>
    custody.some((b) => b.child_person_id === c.id && b.responsible_person_id === selfPerson.id)
  );
  // No custody schedule on file: assume the household's kids are the ones along.
  const kidsAlong = kidsWithMe.length > 0 ? kidsWithMe : custody.length === 0 ? children : [];

  const adults = people
    .filter((p) => !p.is_archived && p.relationship_type !== "self" && p.relationship_type !== "child")
    .map((p) => `${tokenMap.labelFor(p)} (${p.relationship_label || p.relationship_type.replace(/_/g, " ")})`);

  const redacted = messages.map((m) => ({ ...m, text: tokenMap.redactMentions(m.text) }));
  const roughEnd = new Date(now.getTime() + 6 * 60 * 60 * 1000);

  let aiText: string;
  try {
    const result = await callAi(supabase, {
      householdId,
      timezone: ctx.timezone,
      feature: "day_plan",
      systemPrompt: DAY_PLAN_SYSTEM_PROMPT,
      userPrompt: buildDayPlanUserPrompt({
        nowLabel: format(now, "EEEE, h:mm a"),
        meals: mealWindowsCrossed(now, roughEnd),
        adults,
        childrenWithPerson: kidsAlong.map((c) => tokenMap.labelFor(c)),
        messages: redacted,
      }),
      maxTokens: 1500,
    });
    aiText = result.text;
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      return { status: "unavailable", message: "Planning is temporarily unavailable. Try again in a few minutes." };
    }
    if (error instanceof AiBudgetExceededError) {
      return { status: "unavailable", message: "Today's AI budget for this household has been reached — try again tomorrow." };
    }
    throw error;
  }

  const parsed = parseAiJson(aiText);
  const validated = parsed.success ? dayPlanResponseSchema.safeParse(parsed.data) : null;
  if (!validated?.success) return { status: "error", message: "I lost my train of thought — try saying that again." };
  const plan = validated.data;
  const message = tokenMap.restoreRealNames(plan.message);

  if (plan.stage !== "ready" || plan.stops.length === 0) return { status: "asking", message };

  const missingDuration = plan.stops.find((s) => s.durationMinutes == null);
  if (missingDuration) {
    return { status: "asking", message: `${message}\n\nHow long would you like at ${tokenMap.restoreRealNames(missingDuration.name)}?` };
  }

  // Where is each stop?
  const resolved: Array<{ stop: (typeof plan.stops)[number]; person: PersonRow | null; address: string | null; lat: number | null; lng: number | null }> = [];
  let geocoded = 0;
  for (const stop of plan.stops) {
    let person: PersonRow | null = null;
    if (stop.personReference) {
      const ref = resolvePersonReference(stop.personReference, people);
      if (ref.kind === "ambiguous") {
        const names = ref.personIds.map((id) => people.find((p) => p.id === id)).filter((p): p is PersonRow => !!p).map((p) => p.nickname || p.full_name);
        return { status: "asking", message: `Which one do you mean by “${stop.personReference}”: ${names.join(" or ")}?` };
      }
      if (ref.kind === "match") person = people.find((p) => p.id === ref.personId) ?? null;
    }

    let address: string | null = person?.address ?? null;
    let lat: number | null = person?.address_lat ?? null;
    let lng: number | null = person?.address_lng ?? null;

    if (lat == null || lng == null) {
      const query = address ?? stop.placeHint ?? (person ? null : stop.name);
      if (query) {
        if (geocoded > 0) await sleep(GEOCODE_GAP_MS);
        geocoded += 1;
        const outcome = await geocodeAddress(query, { near: homePoint ?? undefined });
        if (outcome.status === "ok") {
          lat = outcome.result.lat;
          lng = outcome.result.lng;
          address = address ?? stop.placeHint ?? outcome.result.displayName;
        }
      }
    }

    if (lat == null || lng == null) {
      const who = person ? `${person.nickname || person.full_name}'s address` : `the address of ${tokenMap.restoreRealNames(stop.name)}`;
      return {
        status: "asking",
        message: `${message}\n\nI couldn't find ${who}. What is it? (A street address, or the town it's in, works.)`,
      };
    }
    resolved.push({ stop, person, address, lat, lng });
  }

  // Drive time between stops (from home to the first).
  const driveMinutes: number[] = [];
  let previous = homePoint;
  for (const r of resolved) {
    const here = { lat: r.lat as number, lng: r.lng as number };
    if (!previous) {
      driveMinutes.push(0);
    } else {
      const trip = await getTravelTime(previous, here, {
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
        mapboxAccessToken: process.env.MAPBOX_ACCESS_TOKEN,
      });
      driveMinutes.push(trip.minutes);
    }
    previous = here;
  }

  const start = plan.startTime ? atClockTime(now, plan.startTime) : roundUpToFive(new Date(now.getTime() + 5 * 60 * 1000));
  const timeline = buildTimeline(
    start < now ? roundUpToFive(new Date(now.getTime() + 5 * 60 * 1000)) : start,
    resolved.map((r, i) => ({
      key: `stop-${i}`,
      name: tokenMap.restoreRealNames(r.stop.name),
      durationMinutes: r.stop.durationMinutes as number,
      driveMinutes: driveMinutes[i],
    }))
  );

  const stops: DayPlanProposalStop[] = timeline.map((t, i) => ({
    key: t.key,
    name: t.name,
    personId: resolved[i].person?.id ?? null,
    personName: resolved[i].person ? resolved[i].person!.nickname || resolved[i].person!.full_name : null,
    address: resolved[i].address,
    lat: resolved[i].lat,
    lng: resolved[i].lng,
    durationMinutes: t.durationMinutes,
    driveMinutes: t.driveMinutes,
    departLocal: format(t.departAt, LOCAL),
    arriveLocal: format(t.arriveAt, LOCAL),
    leaveLocal: format(t.leaveAt, LOCAL),
    notes: resolved[i].stop.notes,
  }));

  return {
    status: "proposal",
    message,
    proposal: {
      stops,
      childPersonIds: plan.withChildren ? kidsAlong.map((c) => c.id) : [],
      homeUnknown: !homePoint,
    },
  };
}
