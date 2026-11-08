// Planning a day out ("Mermaid Cafe, then Defy, then Costco, then dinner at
// Dad's"): the pure parts. Who "Dad's" means, when the day starts, and the
// timeline once the order, durations and drive times are known. The
// conversation and the lookups live elsewhere; nothing here talks to a
// database or an AI.
import { addMinutes } from "date-fns";

export interface ReferencePerson {
  id: string;
  full_name: string;
  nickname: string | null;
  relationship_type: string;
  relationship_label?: string | null;
  gender?: string | null;
  is_archived?: boolean;
}

export type PersonReference =
  | { kind: "match"; personId: string }
  | { kind: "ambiguous"; personIds: string[] }
  | { kind: "none" };

const ROLE_WORDS: Array<{ words: string[]; types: string[]; gender?: "male" | "female" }> = [
  { words: ["dad", "father", "papa", "pops", "pop", "daddy"], types: ["parent"], gender: "male" },
  { words: ["mom", "mother", "mama", "mum", "mommy", "ma"], types: ["parent"], gender: "female" },
  { words: ["grandma", "grandmother", "nana", "granny"], types: ["extended_family"], gender: "female" },
  { words: ["grandpa", "grandfather", "gramps"], types: ["extended_family"], gender: "male" },
  { words: ["brother"], types: ["sibling"], gender: "male" },
  { words: ["sister", "sis"], types: ["sibling"], gender: "female" },
  { words: ["wife"], types: ["spouse", "partner"], gender: "female" },
  { words: ["husband"], types: ["spouse", "partner"], gender: "male" },
  { words: ["girlfriend"], types: ["partner", "spouse"], gender: "female" },
  { words: ["boyfriend"], types: ["partner", "spouse"], gender: "male" },
];

function norm(s: string): string {
  return s.toLowerCase().replace(/['’]s\b/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * "Dad's", "my father", "Fritz", "grandma" -> a person in the household. A name
 * or nickname wins; otherwise a family word is matched to the relationship (and
 * gender when it's on file). More than one fit comes back ambiguous so the
 * assistant can ask rather than guess.
 */
export function resolvePersonReference(reference: string, people: ReferencePerson[]): PersonReference {
  const ref = norm(reference).replace(/^(my|our|the)\s+/, "");
  if (!ref) return { kind: "none" };
  const active = people.filter((p) => !p.is_archived && p.relationship_type !== "self");

  // 1. A name, nickname or relationship label that matches exactly.
  const byName = active.filter((p) =>
    [p.nickname, p.full_name, p.full_name.split(" ")[0], p.relationship_label].some((n) => n && norm(n) === ref)
  );
  if (byName.length === 1) return { kind: "match", personId: byName[0].id };
  if (byName.length > 1) return { kind: "ambiguous", personIds: byName.map((p) => p.id) };

  // 2. A family word.
  const role = ROLE_WORDS.find((r) => r.words.includes(ref));
  if (!role) return { kind: "none" };
  const ofType = active.filter((p) => role.types.includes(p.relationship_type));
  const withGender = role.gender ? ofType.filter((p) => p.gender === role.gender) : ofType;
  // Gender on file narrows it; with none on file, fall back to everyone of that type.
  // Extended family is too broad to guess (any cousin could be "grandpa"): only trust a gender match there.
  const pool =
    withGender.length > 0
      ? withGender
      : role.types.includes("extended_family")
        ? []
        : ofType.filter((p) => !p.gender || p.gender === "prefer_not_to_say");
  if (pool.length === 1) return { kind: "match", personId: pool[0].id };
  if (pool.length > 1) return { kind: "ambiguous", personIds: pool.map((p) => p.id) };
  return { kind: "none" };
}

/** Next five-minute mark at or after `date` (a plan can't start in the past). */
export function roundUpToFive(date: Date): Date {
  const ms = 5 * 60 * 1000;
  return new Date(Math.ceil(date.getTime() / ms) * ms);
}

/** "10:30" on the day of `base`, as a wall-clock Date. */
export function atClockTime(base: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m, 0, 0);
}

export interface PlannedStop {
  key: string;
  name: string;
  durationMinutes: number;
  /** Drive time from wherever you are before this stop (home, or the previous stop). */
  driveMinutes: number;
}

export interface TimelineStop extends PlannedStop {
  /** When you leave the previous place. */
  departAt: Date;
  arriveAt: Date;
  leaveAt: Date;
}

/** Walk the stops in order: drive, arrive, stay, leave. */
export function buildTimeline(start: Date, stops: PlannedStop[]): TimelineStop[] {
  const out: TimelineStop[] = [];
  let cursor = start;
  for (const stop of stops) {
    const departAt = cursor;
    const arriveAt = addMinutes(departAt, stop.driveMinutes);
    const leaveAt = addMinutes(arriveAt, stop.durationMinutes);
    out.push({ ...stop, departAt, arriveAt, leaveAt });
    cursor = leaveAt;
  }
  return out;
}

export type MealWindow = "lunch" | "dinner";

/** Which mealtimes the plan runs across (used to remind the assistant to talk about food). */
export function mealWindowsCrossed(start: Date, end: Date): MealWindow[] {
  const windows: Array<{ name: MealWindow; from: number; to: number }> = [
    { name: "lunch", from: 11 * 60 + 30, to: 13 * 60 + 30 },
    { name: "dinner", from: 17 * 60, to: 19 * 60 + 30 },
  ];
  const s = start.getHours() * 60 + start.getMinutes();
  const e = end.getHours() * 60 + end.getMinutes() + (end.getDate() !== start.getDate() ? 24 * 60 : 0);
  return windows.filter((w) => s < w.to && e > w.from).map((w) => w.name);
}
