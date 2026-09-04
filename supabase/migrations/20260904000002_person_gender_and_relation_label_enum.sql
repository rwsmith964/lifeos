-- D-162: close two open free-text fields into fixed, closed sets of
-- values, per Richard's explicit decision (QUEUE-040, QUEUE-048):
--   1. Add an optional/skippable `gender` field to `people`.
--   2. Constrain `person_relationships.relation_label` to a closed set
--      instead of unrestricted free text (previously only a UI datalist
--      suggestion, never enforced).
--
-- Additive Contract: `gender` is a brand-new nullable column (default
-- null == "not specified", the skip state); every existing person row is
-- unaffected. `relation_label`'s check constraint was verified safe against
-- production data before writing this migration -- `person_relationships`
-- currently has zero rows, so no existing value needs to be reconciled
-- against the new closed set.
--
-- Design notes:
-- - Both are implemented as `text` + `check (... in (...))` rather than a
--   native Postgres `enum` type (contrast with `relationship_type`,
--   created early in the schema as a native enum). A check constraint can
--   be dropped and recreated with a different value list in one
--   migration; widening a native enum's value set only ever grows it
--   (`ALTER TYPE ... ADD VALUE` cannot run inside the same transaction as
--   other DDL on some PG versions and never supports removal), which is a
--   worse fit for two fields realistically expected to evolve.
-- - `relation_label`'s closed set reuses the same nine relationship
--   category values as `people.relationship_type` (see
--   supabase/migrations/20260820000001_extensions_and_enums.sql), plus
--   'other' as an escape hatch -- these are relations *between* two
--   people (e.g. "Dave's wife is Jane"), not a person's relation to the
--   household, but the same vocabulary applies. 'self' is intentionally
--   excluded: a person cannot be described as their own relative.
-- - `gender` is deliberately nullable with no default and no NOT NULL
--   constraint -- this field must stay skippable, especially for
--   children, per the privacy sensitivity flagged in QUEUE-040.

alter table people
  add column gender text;

alter table people
  add constraint people_gender_valid
  check (gender is null or gender in ('female', 'male', 'non_binary', 'prefer_not_to_say'));

alter table person_relationships
  add constraint person_relationships_relation_label_valid
  check (relation_label in (
    'spouse', 'partner', 'child', 'co_parent', 'parent',
    'sibling', 'extended_family', 'friend', 'colleague', 'other'
  ));
