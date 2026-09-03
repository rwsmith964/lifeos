import type { RelationshipType } from "@/lib/db/database.types";

// D-141: one entry per household member collected during the onboarding
// wizard (self, from step 1, plus anyone added in the "add members" step).
// Carried in client state only — every field here already lives on the
// person row itself, this is just the subset the later per-person steps
// (work schedule / recurring commitments / interests) need without a
// re-fetch.
export interface OnboardingPerson {
  id: string;
  fullName: string;
  relationshipType: RelationshipType;
  birthdate: string | null;
  birthYearKnown: boolean;
}
