// Child-name redaction (docs/privacy.md, Section 6.5). The single module
// responsible for deciding what a child-relationship person is called
// inside an AI prompt. Every feature prompt builder should build its
// per-person context through this module rather than interpolating
// `person.full_name` directly for someone who might be a child.
import type { PersonRow } from "../db/database.types";

export interface ChildTokenMap {
  /** Real name for an adult/other person; a stable CHILD_N token for a child. */
  labelFor(person: Pick<PersonRow, "id" | "full_name" | "relationship_type">): string;
  /** Reverses CHILD_N tokens back to real names in AI-generated text. */
  restoreRealNames(text: string): string;
}

/**
 * Builds a stable person-id -> label map for one prompt-building call.
 * Tokens are assigned in a fixed order (by person id) so the same household
 * gets the same CHILD_N assignment across calls within a session, which
 * matters if a prompt lists a child in more than one place.
 */
export function buildChildTokenMap(
  people: Pick<PersonRow, "id" | "full_name" | "relationship_type">[]
): ChildTokenMap {
  const labels = new Map<string, string>();
  const tokenToRealName = new Map<string, string>();

  const children = people
    .filter((p) => p.relationship_type === "child")
    .sort((a, b) => a.id.localeCompare(b.id));

  children.forEach((child, index) => {
    const token = `CHILD_${index + 1}`;
    labels.set(child.id, token);
    tokenToRealName.set(token, child.full_name);
  });

  for (const person of people) {
    if (!labels.has(person.id)) {
      labels.set(person.id, person.full_name);
    }
  }

  return {
    labelFor: (person) => labels.get(person.id) ?? person.full_name,
    restoreRealNames: (text) => {
      let result = text;
      for (const [token, realName] of tokenToRealName) {
        result = result.split(token).join(realName);
      }
      return result;
    },
  };
}
