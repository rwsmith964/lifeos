// The companion layer (Section 9.5) — "ties the planner back to the spine
// ... do not treat it as optional polish." Cross-references an activity's
// preferred_companions against contact_cadences to surface "and call Mike"
// alongside a recommendation. Pure.
import { evaluateCadence } from "../contact/cadence";
import type { ContactCadenceRow } from "../db/database.types";

export interface OverdueCompanion {
  personId: string;
  isOverdue: true;
  daysSinceLastContact: number | null;
}

export function findOverdueCompanions(
  preferredCompanionIds: string[],
  cadencesByPersonId: Map<string, Pick<ContactCadenceRow, "target_interval_days" | "last_contact_date">>,
  today: Date
): OverdueCompanion[] {
  const overdue: OverdueCompanion[] = [];
  for (const personId of preferredCompanionIds) {
    const cadence = cadencesByPersonId.get(personId);
    if (!cadence) continue; // no cadence tracked for this person — nothing to say
    const status = evaluateCadence(cadence, today);
    if (status.isOverdue) {
      overdue.push({ personId, isOverdue: true, daysSinceLastContact: status.daysSinceLastContact });
    }
  }
  return overdue;
}
