-- LifeOS: add gift_suggestions.category.
--
-- Section 7.3 requires each of the three AI-generated suggestions to carry
-- "category (used to look up shipping window)", but Section 4.2's
-- gift_suggestions table list omits a category column (unlike `gifts`,
-- which has one). Without it, order_by_date could still be computed at
-- generation time, but the category it was computed from would be lost —
-- needed both to explain the date later and to carry over onto `gifts` when
-- a suggestion converts. See DECISIONS.md D-015.
--
-- A new migration, not an edit to 20260820000008, per Section 5 ("never
-- edit a committed migration").

alter table gift_suggestions
  add column category text;
