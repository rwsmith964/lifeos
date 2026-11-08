// Suggested travel and prep blocks for upcoming events: "Leave by 4:10 to get
// to Cal's game", "Pack gear for practice". Pure -- the caller resolves drive
// times and supplies what's already been accepted or dismissed. A suggestion
// is never stored until the person accepts it (then it becomes a normal
// calendar event), so nothing here can clutter or alter the real calendar.
import { format, subMinutes } from "date-fns";

export type SuggestionKind = "travel" | "prep";

/** Tag on the calendar_events rows created from an accepted suggestion. */
export const SUGGESTION_SOURCE = "lifeos_suggestion";

export function suggestionKey(kind: SuggestionKind, eventId: string): string {
  return `cal-suggestion:${kind}:${eventId}`;
}

/** external_id stored on the accepted event, so the same suggestion never reappears. */
export function suggestionExternalId(kind: SuggestionKind, eventId: string): string {
  return `${kind}:${eventId}`;
}

/** Drives shorter than this aren't worth a calendar block. */
export const MIN_TRAVEL_MINUTES = 10;
/** Time to find shoes and get out the door on top of the drive itself. */
export const OUT_THE_DOOR_BUFFER_MINUTES = 5;
/** Default gear-gathering time for a kid's activity when no prep time was set on the event. */
export const KID_ACTIVITY_PREP_MINUTES = 20;

export interface SuggestionEvent {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  eventType: string;
  /** Prep minutes the person set on the event itself. */
  prepMinutes: number | null;
  /** Items created from a past suggestion never get suggestions of their own. */
  externalSource: string | null;
}

export interface CalendarSuggestion {
  key: string;
  kind: SuggestionKind;
  eventId: string;
  eventTitle: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  detail: string;
  minutes: number;
  /** True when you'd have to leave before something earlier that day has finished. */
  tight: boolean;
}

export interface BuildSuggestionsInput {
  events: SuggestionEvent[];
  /** Drive minutes to each event (from home or the previous stop), resolved by the caller. */
  travelMinutesByEventId: ReadonlyMap<string, number>;
  /** Keys (see suggestionKey) the person already accepted or dismissed. */
  skipKeys: ReadonlySet<string>;
  now: Date;
}

const NON_SUGGESTABLE_TYPES = new Set(["travel", "prep", "custody", "external"]);

function clock(d: Date): string {
  return format(d, "h:mm a");
}

export function buildSuggestions(input: BuildSuggestionsInput): CalendarSuggestion[] {
  const candidates = input.events
    .filter(
      (e) =>
        !e.allDay &&
        e.startsAt > input.now &&
        !NON_SUGGESTABLE_TYPES.has(e.eventType) &&
        e.externalSource !== SUGGESTION_SOURCE
    )
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const out: CalendarSuggestion[] = [];

  for (const event of candidates) {
    const driveMinutes = input.travelMinutesByEventId.get(event.id) ?? null;
    let travelStart: Date | null = null;

    if (driveMinutes != null && driveMinutes >= MIN_TRAVEL_MINUTES) {
      const total = driveMinutes + OUT_THE_DOOR_BUFFER_MINUTES;
      travelStart = subMinutes(event.startsAt, total);

      // Anything earlier the same day still running when you'd need to leave?
      const clash = input.events.find(
        (other) =>
          other.id !== event.id &&
          !other.allDay &&
          !NON_SUGGESTABLE_TYPES.has(other.eventType) &&
          other.startsAt < event.startsAt &&
          other.endsAt > travelStart! &&
          format(other.startsAt, "yyyy-MM-dd") === format(event.startsAt, "yyyy-MM-dd")
      );

      const key = suggestionKey("travel", event.id);
      if (!input.skipKeys.has(key)) {
        out.push({
          key,
          kind: "travel",
          eventId: event.id,
          eventTitle: event.title,
          title: `Leave for ${event.title}`,
          startsAt: travelStart,
          endsAt: event.startsAt,
          detail: clash
            ? `About ${driveMinutes} min away. You'd need to leave by ${clock(travelStart)}, before “${clash.title}” ends.`
            : `About ${driveMinutes} min away. Leave by ${clock(travelStart)}.`,
          minutes: driveMinutes + OUT_THE_DOOR_BUFFER_MINUTES,
          tight: !!clash,
        });
      }
    }

    const prepMinutes =
      event.prepMinutes && event.prepMinutes > 0
        ? event.prepMinutes
        : event.eventType === "kid_activity"
          ? KID_ACTIVITY_PREP_MINUTES
          : null;
    const prepKey = suggestionKey("prep", event.id);
    if (prepMinutes && !input.skipKeys.has(prepKey)) {
      const prepEnd = travelStart ?? event.startsAt;
      const prepStart = subMinutes(prepEnd, prepMinutes);
      const explicit = !!(event.prepMinutes && event.prepMinutes > 0);
      out.push({
        key: prepKey,
        kind: "prep",
        eventId: event.id,
        eventTitle: event.title,
        title: explicit ? `Get ready for ${event.title}` : `Pack gear for ${event.title}`,
        startsAt: prepStart,
        endsAt: prepEnd,
        detail: explicit
          ? `${prepMinutes} min of prep you set for this event, starting ${clock(prepStart)}.`
          : `Bag, water and gear for the activity. About ${prepMinutes} min before you leave.`,
        minutes: prepMinutes,
        tight: false,
      });
    }
  }

  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export interface TravelLegEvent {
  id: string;
  startsAt: Date;
  lat: number | null;
  lng: number | null;
}

export interface LatLngLike {
  lat: number;
  lng: number;
}

export interface SuggestionLeg {
  eventId: string;
  from: LatLngLike;
  to: LatLngLike;
}

/**
 * Where each drive starts: the previous located event the SAME day, else home.
 * (lib/brief/prep.ts's computeTravelLegs carries the last location across
 * midnight, which is wrong for a multi-day window: yesterday's last stop isn't
 * where you wake up.) With no home known, a day's first event gets no leg.
 */
export function buildSuggestionLegs(events: TravelLegEvent[], home: LatLngLike | null): SuggestionLeg[] {
  const sorted = [...events]
    .filter((e) => e.lat != null && e.lng != null)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const legs: SuggestionLeg[] = [];
  let currentDay = "";
  let previous: LatLngLike | null = home;
  for (const event of sorted) {
    const day = format(event.startsAt, "yyyy-MM-dd");
    if (day !== currentDay) {
      currentDay = day;
      previous = home;
    }
    const to = { lat: event.lat as number, lng: event.lng as number };
    if (previous) legs.push({ eventId: event.id, from: previous, to });
    previous = to;
  }
  return legs;
}
