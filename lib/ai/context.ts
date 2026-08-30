// Child-name redaction (docs/privacy.md, Section 6.5). The single module
// responsible for deciding what a child-relationship person is called
// inside an AI prompt. Every feature prompt builder should build its
// per-person context through this module rather than interpolating
// `person.full_name` directly for someone who might be a child.
//
// P0-2: labelFor() previously returned a bare CHILD_N token for children
// with no nickname/first-name attached anywhere in the roster line the
// model sees. That's correct for privacy (a child's real name never
// reaches the model), but it silently broke every feature that has to
// resolve a person *mentioned in free user text* against that roster --
// "Cal's shoe size is 10" has no literal "CHILD_1" in it for the model to
// match against. Section 6.5 doesn't require redacting the *user's own
// input* going forward, only the token substitution boundary at the
// prompt/response edge -- so the fix is symmetric: redactMentions()
// rewrites a child's nickname/full name/first name to their CHILD_N token
// in raw text BEFORE it's sent to the model (mirroring what
// restoreRealNames already does in the other direction for the model's
// output), so the household roster line and the transcript agree on the
// same token and resolution works without ever sending the real name.
import type { PersonRow } from "../db/database.types";

export interface ChildTokenMap {
  /** Nickname (if set) or full name for an adult/other person; a stable CHILD_N token for a child. Centralized here so every AI feature's roster line resolves nicknames the same way (P0-2) instead of each call site re-deriving its own `nickname || full_name` fallback. */
  labelFor(person: Pick<PersonRow, "id" | "full_name" | "relationship_type">): string;
  /** Reverses CHILD_N tokens back to real names in AI-generated text. */
  restoreRealNames(text: string): string;
  /**
   * Rewrites any case-insensitive, whole-word mention of a child's
   * nickname, full name, or first name in raw free text to that child's
   * CHILD_N token, so text handed to the model can still be matched
   * against the (redacted) household roster line. Non-child people are
   * left as-is in the text -- their real names/nicknames already appear
   * verbatim in the roster, so no substitution is needed for them.
   */
  redactMentions(text: string): string;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function labelForPerson(person: Pick<PersonRow, "full_name"> & { nickname?: string | null }): string {
  return person.nickname || person.full_name;
}

type TokenPerson = Pick<PersonRow, "id" | "full_name" | "relationship_type"> & { nickname?: string | null };

/**
 * Builds a stable person-id -> label map for one prompt-building call.
 * Tokens are assigned in a fixed order (by person id) so the same household
 * gets the same CHILD_N assignment across calls within a session, which
 * matters if a prompt lists a child in more than one place.
 *
 * Accepts `nickname` as optional so existing callers that only ever had
 * `full_name`/`relationship_type` in scope keep compiling; the roster rows
 * every real call site passes in (PersonRow from listPeopleForHousehold)
 * always has it, and every feature now gets nickname-aware labeling and
 * mention matching without special-casing itself (P0-2).
 */
export function buildChildTokenMap(people: TokenPerson[]): ChildTokenMap {
  const labels = new Map<string, string>();
  const tokenToDisplayName = new Map<string, string>();
  // Longest variant first within each child, and children processed in a
  // fixed order, so "Emlyn" (full name) is tried before a shorter "Em"
  // (nickname) can partially eat into it, and one child's variants can't
  // be shadowed by another's in the combined regex alternation.
  const mentionReplacements: { pattern: RegExp; token: string }[] = [];

  const children = people
    .filter((p) => p.relationship_type === "child")
    .sort((a, b) => a.id.localeCompare(b.id));

  children.forEach((child, index) => {
    const token = `CHILD_${index + 1}`;
    labels.set(child.id, token);
    tokenToDisplayName.set(token, labelForPerson(child));

    const firstName = child.full_name.trim().split(/\s+/)[0] ?? child.full_name;
    const variants = Array.from(
      new Set([child.full_name, child.nickname ?? undefined, firstName].filter((v): v is string => !!v?.trim()))
    ).sort((a, b) => b.length - a.length);
    for (const variant of variants) {
      mentionReplacements.push({ pattern: new RegExp(`\\b${escapeRegExp(variant)}\\b`, "gi"), token });
    }
  });

  for (const person of people) {
    if (!labels.has(person.id)) {
      labels.set(person.id, labelForPerson(person));
    }
  }

  return {
    labelFor: (person) => labels.get(person.id) ?? labelForPerson(person),
    restoreRealNames: (text) => {
      let result = text;
      for (const [token, displayName] of tokenToDisplayName) {
        result = result.split(token).join(displayName);
      }
      return result;
    },
    redactMentions: (text) => {
      let result = text;
      for (const { pattern, token } of mentionReplacements) {
        result = result.replace(pattern, token);
      }
      return result;
    },
  };
}
