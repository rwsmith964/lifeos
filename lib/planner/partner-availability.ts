// Who in the household has a recurring "busy" pattern (a girlfriend's kids'
// weeks, for example) and which of the weekend's two days that lands on.
// Pure and DB-free: the planner passes this to the AI as context so a plan
// never proposes doing something with someone on a day they're unavailable,
// and can point out a day they ARE free.
import { format } from "date-fns";
import { busyDatesForPerson, type AvailabilityScheduleLike } from "../availability/expand";

export interface PartnerAvailabilityEntry {
  name: string;
  /** What they call the relationship ("girlfriend"), if set. */
  relationship: string | null;
  /** The schedule's own label ("Kids' weeks"), used to explain why. */
  reason: string | null;
  saturday: "busy" | "free";
  sunday: "busy" | "free";
}

interface PersonLike {
  id: string;
  full_name: string;
  nickname: string | null;
  relationship_label?: string | null;
}

export function summarizePartnerAvailability(
  people: PersonLike[],
  schedules: AvailabilityScheduleLike[],
  saturday: Date,
  sunday: Date
): PartnerAvailabilityEntry[] {
  const entries: PartnerAvailabilityEntry[] = [];
  const satKey = format(saturday, "yyyy-MM-dd");
  const sunKey = format(sunday, "yyyy-MM-dd");

  for (const person of people) {
    const personBusy = schedules.filter((s) => s.kind === "busy" && s.person_id === person.id);
    if (personBusy.length === 0) continue;

    const busyDates = busyDatesForPerson(personBusy, person.id, saturday, sunday);
    entries.push({
      name: person.nickname || person.full_name,
      relationship: person.relationship_label?.toLowerCase() ?? null,
      reason: personBusy.find((s) => s.label)?.label ?? null,
      saturday: busyDates.has(satKey) ? "busy" : "free",
      sunday: busyDates.has(sunKey) ? "busy" : "free",
    });
  }
  return entries;
}

/** Lines for the AI prompt; empty when nobody has an availability pattern. */
export function describePartnerAvailability(entries: PartnerAvailabilityEntry[]): string[] {
  if (entries.length === 0) return [];
  const lines = ["", "People with a recurring availability pattern (use this, don't invent anyone's schedule):"];
  for (const e of entries) {
    const who = e.relationship ? `${e.name} (${e.relationship})` : e.name;
    const why = e.reason ? ` -- ${e.reason}` : "";
    lines.push(`- ${who}: Saturday ${e.saturday}, Sunday ${e.sunday}${e.saturday === "busy" || e.sunday === "busy" ? why : ""}`);
  }
  return lines;
}
