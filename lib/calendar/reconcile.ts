// The same real-world thing often reaches the calendar more than once: typed
// in by hand AND arriving through an imported calendar feed, or entered by two
// people who share a household calendar. Showing both doubles the information
// and makes the day look busier than it is. These helpers collapse such
// duplicates into one entry that keeps the best details from each copy.
// Pure and display-side only -- nothing here deletes a stored event.

export interface ReconcilableEvent {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string | null;
  description?: string | null;
  /** Null for events entered in the app; the feed/system name for imports. */
  external_source: string | null;
}

const STOPWORDS = new Set(["the", "a", "an", "and", "of", "at", "in", "on", "for", "to", "with", "my", "our", "s"]);
const START_TOLERANCE_MS = 15 * 60 * 1000;

function titleTokens(title: string): string[] {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]s\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t));
}

/** Do two titles plausibly name the same thing ("Emma's Wedding" / "Wedding - Emma")? */
export function titlesLookSame(a: string, b: string): boolean {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const sa = new Set(ta);
  const sb = new Set(tb);
  let shared = 0;
  for (const t of sa) if (sb.has(t)) shared += 1;
  const union = sa.size + sb.size - shared;
  if (shared / union >= 0.6) return true;
  // One title wholly inside the other ("Soccer" vs "Soccer practice"): only
  // when the shorter one is a real word, not a stray letter or number.
  const [small, big] = sa.size <= sb.size ? [sa, sb] : [sb, sa];
  return small.size >= 1 && [...small].every((t) => big.has(t)) && [...small].join("").length >= 4;
}

function dayKey(iso: string): string {
  // Stored as floating wall-clock in UTC fields, so the UTC date IS the local date.
  return iso.slice(0, 10);
}

export function isSameOccurrence(a: ReconcilableEvent, b: ReconcilableEvent): boolean {
  if (a.all_day !== b.all_day) return false;
  if (a.all_day) {
    if (dayKey(a.starts_at) !== dayKey(b.starts_at)) return false;
  } else if (Math.abs(new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()) > START_TOLERANCE_MS) {
    return false;
  }
  return titlesLookSame(a.title, b.title);
}

function richness(e: ReconcilableEvent): number {
  return (e.location ? 2 : 0) + (e.description ? 1 : 0) + (e.external_source === null ? 0.5 : 0);
}

export interface ReconcileResult<T extends ReconcilableEvent> {
  events: T[];
  /** How many duplicate copies were folded into another entry. */
  hiddenDuplicates: number;
}

/**
 * Collapses duplicate events. The copy kept is the one that carries the most
 * detail (preferring one entered in the app, since it's directly editable);
 * a location or description missing from it is filled from a hidden copy.
 */
export function reconcileDuplicateEvents<T extends ReconcilableEvent>(events: T[]): ReconcileResult<T> {
  const groups: T[][] = [];
  for (const event of events) {
    const group = groups.find((g) => g.some((member) => isSameOccurrence(member, event)));
    if (group) group.push(event);
    else groups.push([event]);
  }

  let hidden = 0;
  const kept: T[] = [];
  for (const group of groups) {
    if (group.length === 1) {
      kept.push(group[0]);
      continue;
    }
    hidden += group.length - 1;
    const ordered = [...group].sort((a, b) => richness(b) - richness(a));
    const best = { ...ordered[0] };
    for (const other of ordered.slice(1)) {
      if (!best.location && other.location) best.location = other.location;
      if (!best.description && other.description) best.description = other.description;
    }
    kept.push(best);
  }

  // Preserve the original ordering of whichever copy survived.
  const order = new Map(events.map((e, i) => [e.id, i]));
  kept.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return { events: kept, hiddenDuplicates: hidden };
}

export interface BusyDayLike {
  personName: string;
  label: string | null;
  /** "YYYY-MM-DD" */
  date: string;
}

/**
 * A recurring "busy" pattern (e.g. a partner's kids' weeks) and an explicit
 * all-day event for the same days describe the same thing. True when such an
 * event already covers this busy day, so the generic busy marker is redundant.
 */
export function busyDayIsCoveredByEvent(busy: BusyDayLike, events: ReconcilableEvent[]): boolean {
  const personTokens = titleTokens(busy.personName);
  const labelTokens = busy.label ? titleTokens(busy.label).filter((t) => t.length >= 4) : [];
  const GENERIC = ["kids", "kid", "custody", "busy", "unavailable", "away", "week", "weekend"];

  return events.some((e) => {
    if (!e.all_day) return false;
    const startDay = dayKey(e.starts_at);
    const endDay = dayKey(e.ends_at);
    if (busy.date < startDay || busy.date > endDay) return false;

    const tokens = new Set(titleTokens(e.title));
    const mentionsPerson = personTokens.some((t) => tokens.has(t));
    const mentionsLabel = labelTokens.some((t) => tokens.has(t));
    const mentionsGeneric = GENERIC.some((t) => tokens.has(t));
    return mentionsLabel || (mentionsPerson && mentionsGeneric);
  });
}
