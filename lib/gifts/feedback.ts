// The gift feedback loop (Section 7.7): a gift's `reaction`, once known,
// feeds back into interest strength. Explicit function, not an implicit
// trigger side effect, per the spec's own wording. See DECISIONS.md D-016
// for why matching works on description/interest word overlap rather than
// `gifts.category` (which holds a shipping category, not a topical one).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GiftRow, InterestStrength, PersonInterestRow } from "../db/database.types";
import { giftsRepo } from "../db/repositories/gifts";
import { listInterestsForPerson, personInterestsRepo } from "../db/repositories/people";

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "set",
  "kit",
  "gift",
  "card",
  "box",
]);

const STRENGTH_ORDER: InterestStrength[] = ["casual", "regular", "passionate"];

export function bumpStrength(current: InterestStrength): InterestStrength {
  const index = STRENGTH_ORDER.indexOf(current);
  return STRENGTH_ORDER[Math.min(index + 1, STRENGTH_ORDER.length - 1)];
}

export function lowerStrength(current: InterestStrength): InterestStrength {
  const index = STRENGTH_ORDER.indexOf(current);
  return STRENGTH_ORDER[Math.max(index - 1, 0)];
}

function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 3 && !STOPWORDS.has(word))
  );
}

/** Interests that share at least one significant word with the gift's description. */
export function interestsMatchingGift(
  interests: Pick<PersonInterestRow, "id" | "interest" | "strength">[],
  gift: Pick<GiftRow, "description">
): Pick<PersonInterestRow, "id" | "interest" | "strength">[] {
  const giftWords = significantWords(gift.description);
  if (giftWords.size === 0) return [];
  return interests.filter((interest) => {
    const interestWords = significantWords(interest.interest);
    for (const word of interestWords) {
      if (giftWords.has(word)) return true;
    }
    return false;
  });
}

/**
 * Applies one gift's reaction to any interest it matches. No-op if the gift
 * has no reaction yet, or matches no existing interest. Safe to call
 * multiple times (idempotent is NOT guaranteed across repeated calls with a
 * changing reaction — call once per reaction change, e.g. right after the
 * repository update that sets `gifts.reaction`).
 */
export async function applyGiftFeedback(client: SupabaseClient, giftId: string): Promise<void> {
  const gift = await giftsRepo.getById(client, giftId);
  if (!gift || !gift.reaction) return;
  if (gift.reaction === "liked_it" || gift.reaction === "neutral") return;

  const interests = await listInterestsForPerson(client, gift.person_id);
  const matched = interestsMatchingGift(interests, gift);

  for (const interest of matched) {
    const newStrength =
      gift.reaction === "loved_it" ? bumpStrength(interest.strength) : lowerStrength(interest.strength);
    if (newStrength !== interest.strength) {
      await personInterestsRepo.update(client, interest.id, { strength: newStrength });
    }
  }
}
