// "Bring a pecan pie" in your note for an event means: shop for it, and bake
// it before. These helpers turn the note an invitee received into suggested
// errand blocks (shopping, cooking) placed ahead of the event. Deterministic
// keyword rules -- nothing is guessed beyond what the note says.
export interface ErrandIdea {
  /** What to shop for or cook, as written ("a pecan pie"). */
  what: string;
  cook: boolean;
}

const COOK_VERBS = /\b(make|bake|cook|prepare|prep|fix|roast|grill)\b/i;
const SHOP_VERBS = /\b(bring|buy|get|grab|pick up|pickup|purchase)\b/i;

/** Splits a note into clauses and finds the "bring X" / "make X" ones. */
export function errandIdeasFromNote(note: string | null | undefined): ErrandIdea[] {
  if (!note) return [];
  const ideas: ErrandIdea[] = [];
  const clauses = note.split(/[.;\n]|,\s*(?:and\s+)?|\band\b(?=\s+(?:bring|make|bake|cook|buy|get|grab|pick))/i);
  for (const raw of clauses) {
    const clause = raw.trim();
    if (!clause) continue;
    const cook = COOK_VERBS.exec(clause);
    const shop = SHOP_VERBS.exec(clause);
    const match = cook ?? shop;
    if (!match) continue;
    const what = clause
      .slice(match.index + match[0].length)
      .replace(/^\s*(a|an|the|some|your|our)\b\s*/i, "")
      .replace(/\b(please|for (everyone|us|dinner|the party))\b/gi, "")
      .trim();
    if (what.length < 2 || what.length > 80) continue;
    ideas.push({ what, cook: !!cook });
  }
  return ideas.slice(0, 4);
}

/** The line of an event's description that holds the invitee's own note. */
export const PERSONAL_NOTE_PREFIX = "Your note: ";

export function personalNoteFromDescription(description: string | null | undefined): string | null {
  if (!description) return null;
  const line = description.split("\n").find((l) => l.startsWith(PERSONAL_NOTE_PREFIX));
  return line ? line.slice(PERSONAL_NOTE_PREFIX.length).trim() || null : null;
}
