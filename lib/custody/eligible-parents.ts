import type { PersonRow, RelationshipType } from "../db/database.types";

// "parent" as a relationship_type means "this person is the household
// self-person's own parent" (a grandparent to the kids) — not "a parent
// of the children." Including it here was the round-2 brief 2.6 bug: the
// responsible-adult picker offered grandparents alongside actual
// co-parents. Household membership (Phase 4.1) will eventually make this
// precise; until then, this is the closest approximation available.
const ELIGIBLE_RESPONSIBLE_RELATIONSHIP_TYPES: RelationshipType[] = ["self", "co_parent", "spouse", "partner"];

export function filterEligibleResponsibleAdults(people: PersonRow[]): PersonRow[] {
  return people.filter((p) => ELIGIBLE_RESPONSIBLE_RELATIONSHIP_TYPES.includes(p.relationship_type));
}
