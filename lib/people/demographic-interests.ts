// D-137: demographic-based interest suggestion bubbles for a person's
// profile (Build Brief item — "the tool should look at the profile of the
// person (age, gender, general demographics) and suggest things that are
// popular with that demographic set so that people don't forget").
//
// The schema has no gender field on people (database.types.ts PersonRow),
// so suggestions are bucketed on age + relationship_type only — see
// QUEUE-040 for the gender question this raises. Age comes from the
// person's birthdate via estimateAgeYears (lib/ai/prompts/gift-suggestion.ts),
// the same helper gift suggestions already use, so "how old is this
// person" has one answer across the app rather than two age-math
// implementations that could drift.
//
// This is a static, curated starter list — not AI-generated — so it never
// hallucinates a trend and costs nothing to render. It is intentionally
// broad/non-gendered per bucket (e.g. "Paw Patrol" and "Spiderman" both
// appear in the young-child bucket) rather than split by a demographic
// attribute the app doesn't collect.

import type { RelationshipType } from "@/lib/db/database.types";

export interface InterestSuggestion {
  interest: string;
  category: string;
}

export type AgeBucket =
  | "infant_toddler" // 0-2
  | "preschool" // 3-4
  | "young_child" // 5-8
  | "tween" // 9-12
  | "teen" // 13-17
  | "young_adult" // 18-25
  | "adult" // 26-64
  | "senior" // 65+
  | "unknown"; // no birthdate on file, or relationship type where age isn't the useful signal

export function ageBucketFor(ageYears: number | null): AgeBucket {
  if (ageYears === null) return "unknown";
  if (ageYears <= 2) return "infant_toddler";
  if (ageYears <= 4) return "preschool";
  if (ageYears <= 8) return "young_child";
  if (ageYears <= 12) return "tween";
  if (ageYears <= 17) return "teen";
  if (ageYears <= 25) return "young_adult";
  if (ageYears <= 64) return "adult";
  return "senior";
}

const BUCKET_SUGGESTIONS: Record<Exclude<AgeBucket, "unknown">, InterestSuggestion[]> = {
  infant_toddler: [
    { interest: "Bluey", category: "shows" },
    { interest: "Sensory play", category: "activities" },
    { interest: "Board books", category: "reading" },
    { interest: "Building blocks", category: "toys" },
    { interest: "Music & singalongs", category: "activities" },
    { interest: "Peekaboo / puppet play", category: "activities" },
  ],
  preschool: [
    { interest: "Paw Patrol", category: "shows" },
    { interest: "Bluey", category: "shows" },
    { interest: "Dinosaurs", category: "hobbies" },
    { interest: "Coloring & crafts", category: "activities" },
    { interest: "Playground / park", category: "activities" },
    { interest: "Puzzles", category: "toys" },
    { interest: "Dress-up & pretend play", category: "activities" },
  ],
  young_child: [
    { interest: "Spiderman", category: "shows" },
    { interest: "Paw Patrol", category: "shows" },
    { interest: "Minecraft", category: "video games" },
    { interest: "Legos", category: "toys" },
    { interest: "Pokémon", category: "hobbies" },
    { interest: "Swimming", category: "sports" },
    { interest: "Soccer", category: "sports" },
    { interest: "Bike riding", category: "activities" },
    { interest: "Superheroes", category: "hobbies" },
    { interest: "Arts & crafts", category: "activities" },
  ],
  tween: [
    { interest: "Minecraft", category: "video games" },
    { interest: "Roblox", category: "video games" },
    { interest: "Pokémon", category: "hobbies" },
    { interest: "Basketball", category: "sports" },
    { interest: "Soccer", category: "sports" },
    { interest: "Drawing / art", category: "hobbies" },
    { interest: "Reading graphic novels", category: "reading" },
    { interest: "Skateboarding", category: "sports" },
    { interest: "Board games", category: "hobbies" },
    { interest: "Slime / DIY crafts", category: "hobbies" },
  ],
  teen: [
    { interest: "Video games", category: "hobbies" },
    { interest: "Music / streaming playlists", category: "hobbies" },
    { interest: "Social media & content creation", category: "hobbies" },
    { interest: "Fashion", category: "hobbies" },
    { interest: "Basketball", category: "sports" },
    { interest: "Skateboarding", category: "sports" },
    { interest: "Anime & manga", category: "hobbies" },
    { interest: "Photography", category: "hobbies" },
    { interest: "Cooking / baking", category: "hobbies" },
    { interest: "Board games / D&D", category: "hobbies" },
  ],
  young_adult: [
    { interest: "Concerts & live music", category: "entertainment" },
    { interest: "Video games", category: "hobbies" },
    { interest: "Hiking", category: "outdoors" },
    { interest: "Coffee / cafes", category: "food & drink" },
    { interest: "Fitness / gym", category: "hobbies" },
    { interest: "Travel", category: "hobbies" },
    { interest: "Cooking", category: "food & drink" },
    { interest: "Photography", category: "hobbies" },
    { interest: "Craft beer / cocktails", category: "food & drink" },
  ],
  adult: [
    { interest: "Cooking", category: "food & drink" },
    { interest: "Hiking", category: "outdoors" },
    { interest: "Gardening", category: "hobbies" },
    { interest: "Wine / craft beer", category: "food & drink" },
    { interest: "Golf", category: "sports" },
    { interest: "Reading", category: "reading" },
    { interest: "Travel", category: "hobbies" },
    { interest: "Home improvement / DIY", category: "hobbies" },
    { interest: "Fishing", category: "outdoors" },
    { interest: "Fitness", category: "hobbies" },
    { interest: "Photography", category: "hobbies" },
  ],
  senior: [
    { interest: "Gardening", category: "hobbies" },
    { interest: "Golf", category: "sports" },
    { interest: "Reading", category: "reading" },
    { interest: "Travel", category: "hobbies" },
    { interest: "Puzzles", category: "hobbies" },
    { interest: "Cooking / baking", category: "food & drink" },
    { interest: "Grandkids' activities", category: "family" },
    { interest: "Woodworking", category: "hobbies" },
    { interest: "Birdwatching", category: "outdoors" },
  ],
};

// A relationship_type of "child" is a strong enough signal on its own to
// bias toward kid-relevant suggestions even before a birthdate is on file
// (a brand-new person record often has no birthdate yet). Adults default
// to the general adult bucket rather than showing nothing.
const RELATIONSHIP_FALLBACK_BUCKET: Partial<Record<RelationshipType, Exclude<AgeBucket, "unknown">>> = {
  child: "young_child",
  self: "adult",
  spouse: "adult",
  partner: "adult",
  co_parent: "adult",
  parent: "adult",
  sibling: "adult",
  extended_family: "adult",
  friend: "adult",
  colleague: "adult",
};

/**
 * Suggested interests for a person, given their estimated age (or null if
 * unknown) and relationship type. Always returns a non-empty list — falls
 * back to the relationship-type bucket, then to general adult suggestions,
 * so there's always something to offer rather than an empty widget.
 */
export function suggestedInterestsFor(
  ageYears: number | null,
  relationshipType: RelationshipType
): InterestSuggestion[] {
  const bucket = ageBucketFor(ageYears);
  if (bucket !== "unknown") return BUCKET_SUGGESTIONS[bucket];
  const fallback = RELATIONSHIP_FALLBACK_BUCKET[relationshipType] ?? "adult";
  return BUCKET_SUGGESTIONS[fallback];
}
