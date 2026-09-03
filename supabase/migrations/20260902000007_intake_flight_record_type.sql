-- R-1 (D-142): widen intake_drafts.detected_record_type to allow 'flight'.
-- Additive only, per the Additive Contract -- no new table, no column
-- added or removed, only the allowed-values list on an existing check
-- constraint grows (identical pattern to the module7 migration
-- 20260901000007_module7_household_layer.sql's own widening of this same
-- constraint to add 'recipe').
--
-- 'flight' lets a household member upload a flight confirmation/boarding
-- pass screenshot through the existing universal-intake pipeline
-- (lib/intake/prompts.ts, lib/intake/convert.ts) and have it recognized
-- as a distinct record type instead of being forced into 'calendar_event'
-- or 'ambiguous' -- see ROADMAP-PROACTIVE-ASSISTANT.md R-1 and
-- lib/intake/trip-cascade.ts for what an approved 'flight' draft does
-- (a TSA-cutoff/drive-time/pack-time cascade of derived draft events,
-- never a silent write).
alter table intake_drafts drop constraint intake_drafts_detected_record_type_check;
alter table intake_drafts add constraint intake_drafts_detected_record_type_check check (
  detected_record_type in ('calendar_event', 'gift_idea', 'person', 'moment', 'person_note', 'task', 'recipe', 'flight', 'ambiguous')
);
