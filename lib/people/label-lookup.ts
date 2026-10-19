import type { PersonRow } from "../db/database.types";

/**
 * Resolves the free-text name the daily brief uses ("Fritz", "Jackie") back
 * to a real person row. The brief labels people nickname-first (see
 * lib/ai/context.ts's labelFor), but Today used to look people up by
 * `full_name` only -- so anyone with a nickname never resolved, and their
 * Today card lost its Log contact / Text actions and fell back to a generic
 * "Find in People" link.
 *
 * Keys: full name, nickname, and first name. Any key that would point at two
 * different people is dropped entirely rather than guessing which one was
 * meant -- an unresolved card is a safe degradation, a card that logs
 * contact against the wrong person is not.
 */
export function buildPersonLabelLookup(people: PersonRow[]): Map<string, PersonRow> {
  const candidates = new Map<string, Set<PersonRow>>();
  const add = (key: string | null | undefined, person: PersonRow) => {
    const trimmed = key?.trim();
    if (!trimmed) return;
    const existing = candidates.get(trimmed);
    if (existing) existing.add(person);
    else candidates.set(trimmed, new Set([person]));
  };

  for (const person of people) {
    add(person.full_name, person);
    add(person.nickname, person);
    add(person.full_name.split(/\s+/)[0], person);
  }

  const lookup = new Map<string, PersonRow>();
  for (const [key, matches] of candidates) {
    if (matches.size === 1) lookup.set(key, [...matches][0]!);
  }
  return lookup;
}
