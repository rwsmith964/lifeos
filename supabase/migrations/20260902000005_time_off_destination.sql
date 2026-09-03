-- D-135: weekend planner should recognize household travel, not just
-- recommend the next-highest-scoring local activity when someone is away.
-- Root cause confirmed live: Richard logged a real "Vacation" time-off
-- entry (Aug 31 - Sep 4), but (a) generateWeekendPlan() in
-- lib/planner/generate.ts never queried time_off_entries at all, so it kept
-- scoring/recommending local activities (golf) regardless, and (b)
-- time_off_entries had nowhere to record *where* someone is going, so even
-- a planner that did check the table couldn't say "LA" specifically.
--
-- Additive Contract: one new nullable column on an existing table. No
-- rename, no retype, no dropped column, no changed default.

alter table time_off_entries
  add column destination text null;

comment on column time_off_entries.destination is
  'Optional free-text trip destination (e.g. "Los Angeles, CA"). Null means an ordinary local time-off entry (sick day, appointment, unspecified vacation) with no travel-specific behavior implied beyond "away/unavailable for outings".';
