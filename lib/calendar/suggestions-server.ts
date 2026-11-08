// Server half of calendar suggestions: resolves drive times for the visible
// window and works out what's already been accepted or dismissed, then hands
// everything to the pure builder in suggestions.ts. Read-only.
import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import type { CalendarEventRow } from "../db/database.types";
import { listActiveDismissalsForPerson } from "../db/repositories/today-dismissals";
import { getTravelTime, type GetTravelTimeOptions } from "../external/travel";
import {
  buildSuggestionLegs,
  buildSuggestions,
  suggestionExternalId,
  suggestionKey,
  SUGGESTION_SOURCE,
  type CalendarSuggestion,
  type LatLngLike,
  type SuggestionKind,
} from "./suggestions";

const MAX_LEGS_PER_LOAD = 25;
const NEVER = "2099-12-31";

/** hidden_until value that keeps a dismissed suggestion hidden permanently. */
export const SUGGESTION_DISMISSED_UNTIL = NEVER;

export async function loadCalendarSuggestions(
  client: SupabaseClient,
  params: {
    selfPersonId: string;
    /** Every event in the visible window, including ones created from accepted suggestions. */
    allEvents: CalendarEventRow[];
    /** The events that are on the viewer's own day -- suggestions are only made for these. */
    myEvents: CalendarEventRow[];
    home: LatLngLike | null;
    now: Date;
    travelOptions?: GetTravelTimeOptions;
  }
): Promise<CalendarSuggestion[]> {
  const { allEvents, myEvents, home, now } = params;

  const acceptedKeys = new Set<string>();
  for (const e of allEvents) {
    if (e.external_source !== SUGGESTION_SOURCE || !e.external_id) continue;
    const [kind, ...rest] = e.external_id.split(":");
    if (kind === "travel" || kind === "prep") acceptedKeys.add(suggestionKey(kind as SuggestionKind, rest.join(":")));
  }

  // The table may not exist yet or the read may fail: no dismissals is better than no calendar.
  const dismissed = await listActiveDismissalsForPerson(client, params.selfPersonId, format(now, "yyyy-MM-dd")).catch(
    () => new Set<string>()
  );
  const skipKeys = new Set<string>([...acceptedKeys, ...dismissed]);

  const upcoming = myEvents.filter(
    (e) => !e.all_day && new Date(e.starts_at) > now && e.external_source !== SUGGESTION_SOURCE
  );

  const legs = buildSuggestionLegs(
    upcoming.map((e) => ({ id: e.id, startsAt: new Date(e.starts_at), lat: e.location_lat, lng: e.location_lng })),
    home
  ).slice(0, MAX_LEGS_PER_LOAD);

  const resolved = await Promise.all(
    legs.map(async (leg) => {
      const result = await getTravelTime(leg.from, leg.to, params.travelOptions ?? {});
      return [leg.eventId, result.minutes] as const;
    })
  );

  return buildSuggestions({
    events: myEvents.map((e) => ({
      id: e.id,
      title: e.title,
      startsAt: new Date(e.starts_at),
      endsAt: new Date(e.ends_at),
      allDay: e.all_day,
      eventType: e.event_type,
      prepMinutes: e.prep_time_before_minutes,
      externalSource: e.external_source,
    })),
    travelMinutesByEventId: new Map(resolved),
    skipKeys,
    now,
  });
}

export { suggestionExternalId };
