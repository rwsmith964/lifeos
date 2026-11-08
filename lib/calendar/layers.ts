// Calendar layers. The calendar's main job is to show the signed-in person
// what THEY need to be doing and when. Everything else -- who has the kids,
// school hours, a partner's busy weeks, the rest of the family's plans -- is a
// layer that can be switched on to see the whole picture and is off otherwise,
// so a work shift isn't buried under "the kids are with Mel" and "the kids are
// in school" rows that don't change what you do.

export const CALENDAR_LAYERS = [
  { id: "custody", label: "Kids' custody", hint: "Who has the kids and when" },
  { id: "school", label: "School", hint: "School hours" },
  { id: "partners", label: "Partners' busy days", hint: "Days a partner isn't free" },
  { id: "family", label: "Rest of the family", hint: "Other people's events" },
  { id: "others_work", label: "Others' work", hint: "Shifts and time off for others" },
  { id: "birthdays", label: "Birthdays", hint: "Birthdays and anniversaries" },
] as const;

export type CalendarLayerId = (typeof CALENDAR_LAYERS)[number]["id"];

const VALID = new Set<string>(CALENDAR_LAYERS.map((l) => l.id));

/** What's on when nobody has chosen: your own day plus birthdays. */
export const DEFAULT_LAYERS: readonly CalendarLayerId[] = ["birthdays"];

export const LAYERS_COOKIE = "cal_layers";

function parseList(raw: string): Set<CalendarLayerId> {
  if (raw === "none") return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is CalendarLayerId => VALID.has(s))
  );
}

/**
 * An explicit `layers` URL param wins (so a link is shareable and a toggle is
 * immediate), then the remembered cookie, then the defaults. "none" means the
 * person turned everything optional off.
 */
export function parseLayers(param: string | undefined | null, cookie?: string | null): Set<CalendarLayerId> {
  if (param != null && param !== "") return parseList(param);
  if (cookie != null && cookie !== "") return parseList(cookie);
  return new Set(DEFAULT_LAYERS);
}

export function serializeLayers(layers: ReadonlySet<CalendarLayerId>): string {
  const ordered = CALENDAR_LAYERS.map((l) => l.id).filter((id) => layers.has(id));
  return ordered.length === 0 ? "none" : ordered.join(",");
}

export function toggleLayer(layers: ReadonlySet<CalendarLayerId>, id: CalendarLayerId): Set<CalendarLayerId> {
  const next = new Set(layers);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export interface EventLayerInput {
  selfPersonId: string;
  createdByPersonId: string;
  attendeePersonIds: string[];
  childPersonIds: ReadonlySet<string>;
  /** The existing kid-event rule: a kid's event only matters to you on a day you have the kid (unless attendance is required). */
  passesKidEventRule: boolean;
}

/**
 * Is this event part of the viewer's own day ("mine"), or someone else's
 * ("family")? An event you created is yours. A kid's event
 * counts as yours only on days you have that kid.
 */
export function eventLayerFor(input: EventLayerInput): "mine" | "family" {
  if (!input.passesKidEventRule) return "family";
  // You are implicitly on every event you create (the attendee picker never
  // lists you), even when you only picked the other people going.
  if (input.createdByPersonId === input.selfPersonId) return "mine";
  if (input.attendeePersonIds.length === 0) return "family";
  const attendsSelf = input.attendeePersonIds.includes(input.selfPersonId);
  const hasChild = input.attendeePersonIds.some((id) => input.childPersonIds.has(id));
  return attendsSelf || hasChild ? "mine" : "family";
}
