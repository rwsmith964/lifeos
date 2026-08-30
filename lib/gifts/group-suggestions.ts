// Grouping for the /gifts list (P1-11). Splits a flat, already-sorted
// suggestion list into person groups, each containing "run" groups (one
// run = one call to generateGiftSuggestions, identified by its
// person/occasion_type/occasion_date key) -- so the page can render one
// heading per person and a sub-heading per occasion instead of an
// undifferentiated flat list of cards.
import type { OccasionType } from "../db/database.types";

export interface SuggestionLike {
  person_id: string;
  occasion_type: OccasionType;
  occasion_date: string;
  person: { full_name: string };
}

export interface RunGroup<T> {
  occasionType: OccasionType;
  occasionDate: string;
  suggestions: T[];
}

export interface PersonGroup<T> {
  personId: string;
  personName: string;
  runs: RunGroup<T>[];
}

/**
 * Groups by person first (in order of each person's first appearance in
 * the input -- i.e. their most urgent suggestion, assuming the input is
 * pre-sorted by order_by_date), then by occasion run within each person.
 * Pure and order-preserving; does no sorting or deduping of its own.
 */
export function groupSuggestionsByPersonAndRun<T extends SuggestionLike>(suggestions: T[]): PersonGroup<T>[] {
  const personGroups: PersonGroup<T>[] = [];
  const personIndexByKey = new Map<string, number>();
  const runIndexByKey = new Map<string, number>();

  for (const suggestion of suggestions) {
    let personIdx = personIndexByKey.get(suggestion.person_id);
    if (personIdx === undefined) {
      personIdx = personGroups.length;
      personIndexByKey.set(suggestion.person_id, personIdx);
      personGroups.push({
        personId: suggestion.person_id,
        personName: suggestion.person.full_name,
        runs: [],
      });
    }
    const person = personGroups[personIdx];

    const runKey = `${suggestion.person_id}__${suggestion.occasion_type}__${suggestion.occasion_date}`;
    let runIdx = runIndexByKey.get(runKey);
    if (runIdx === undefined) {
      runIdx = person.runs.length;
      runIndexByKey.set(runKey, runIdx);
      person.runs.push({
        occasionType: suggestion.occasion_type,
        occasionDate: suggestion.occasion_date,
        suggestions: [],
      });
    }
    person.runs[runIdx].suggestions.push(suggestion);
  }

  return personGroups;
}
