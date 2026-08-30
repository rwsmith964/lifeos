// Fuzzy title dedup (P1-11). Gift suggestion titles vary slightly between
// AI calls for what is effectively the same underlying product — e.g.
// "Little Tikes Totsports Easy Hit Golf Set" vs "Little Tikes TotSports
// Easy Score Golf Set", or "Hot Wheels Monster Trucks Arena Smashers
// Playset" vs "Hot Wheels Monster Truck Arena Smash Playset" (both
// observed in production for the same person). Exact-string dedup misses
// these; this module does word-token overlap with light prefix-matching
// (catches plural/singular and short suffix variants like
// "smashers"/"smash") instead of pulling in a full fuzzy-string library
// for one comparison.
//
// Used from two points that share this single implementation (not two
// divergent copies): lib/gifts/suggest.ts (write path — don't create a new
// suggestion that fuzzy-duplicates one already active for this person) and
// app/(app)/gifts/page.tsx (read path — defensively collapse any
// duplicates already sitting in the database from before this fix).

const STOP_WORDS = new Set(["a", "an", "the", "for", "with", "and", "or", "of", "to", "in", "on"]);

function normalizeTitleTokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0 && !STOP_WORDS.has(word));
}

/** Two tokens "roughly match" if identical, or one is a prefix of the
 * other with at least 4 shared characters — catches trucks/truck,
 * smashers/smash, etc. without a full stemmer. */
function tokensRoughlyMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const minLen = Math.min(a.length, b.length);
  if (minLen < 4) return false;
  return a.startsWith(b) || b.startsWith(a);
}

/**
 * Token-overlap similarity in [0, 1], robust to word order and minor
 * pluralization/suffix differences. 0 when either title has no
 * significant (non-stopword) tokens.
 */
export function titleSimilarity(a: string, b: string): number {
  const tokensA = normalizeTitleTokens(a);
  const tokensB = normalizeTitleTokens(b);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const usedB = new Set<number>();
  let matched = 0;
  for (const tokenA of tokensA) {
    const idx = tokensB.findIndex((tokenB, i) => !usedB.has(i) && tokensRoughlyMatch(tokenA, tokenB));
    if (idx !== -1) {
      matched += 1;
      usedB.add(idx);
    }
  }
  const union = tokensA.length + tokensB.length - matched;
  return union === 0 ? 0 : matched / union;
}

/** Chosen from the two real production duplicate pairs this fix targets
 * (similarity 0.75 and 1.0) with margin below both, while staying above
 * typical incidental overlap between genuinely different gift titles. */
export const FUZZY_TITLE_DUPLICATE_THRESHOLD = 0.6;

export function isFuzzyDuplicateTitle(candidate: string, existingTitles: string[]): boolean {
  return existingTitles.some((existing) => titleSimilarity(candidate, existing) >= FUZZY_TITLE_DUPLICATE_THRESHOLD);
}

/**
 * Dedupes a list against itself, keeping the first occurrence of each
 * fuzzy-duplicate group (callers should sort first so "first" is the one
 * worth keeping — e.g. most urgent order-by date).
 */
export function dedupeFuzzyTitles<T>(items: T[], titleOf: (item: T) => string): T[] {
  const kept: T[] = [];
  const keptTitles: string[] = [];
  for (const item of items) {
    const title = titleOf(item);
    if (isFuzzyDuplicateTitle(title, keptTitles)) continue;
    kept.push(item);
    keptTitles.push(title);
  }
  return kept;
}

/**
 * Defensive display-time dedup for the /gifts list (P1-11). Duplicates
 * created before this fix already sit in the database, and generation-time
 * blocking in lib/gifts/suggest.ts only prevents new ones -- this collapses
 * any remaining fuzzy-duplicate titles *within the same person* so they
 * never render as separate cards. Scoped per person (not globally): two
 * different people legitimately getting a similar gift idea is not a bug.
 * Assumes the input is already stably sorted (e.g. by order_by_date) so
 * "first occurrence kept per person" is the most urgent one.
 */
export function dedupeSuggestionsPerPerson<T extends { person_id: string; title: string }>(suggestions: T[]): T[] {
  const seenTitlesByPerson = new Map<string, string[]>();
  const kept: T[] = [];
  for (const suggestion of suggestions) {
    const seen = seenTitlesByPerson.get(suggestion.person_id) ?? [];
    if (isFuzzyDuplicateTitle(suggestion.title, seen)) continue;
    seen.push(suggestion.title);
    seenTitlesByPerson.set(suggestion.person_id, seen);
    kept.push(suggestion);
  }
  return kept;
}
