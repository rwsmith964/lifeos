-- D-083 (P3-1): "last done" tracking on activities. A date-only column
-- (not timestamptz -- we only ever know "the day this happened," matching
-- how gift_history.occasion_date and interactions.occurred_on already model
-- day-granularity events elsewhere) set either automatically when an
-- opportunity for this activity is marked "Acted on", or manually via the
-- activity edit form. The weekend planner and opportunity detector both
-- read it to weight recency into the score (see lib/planner/recency.ts).
alter table user_activities
  add column last_done_at date;

comment on column user_activities.last_done_at is
  'Date this activity was last actually done -- set from marking an opportunity "Acted on" (uses the opportunity''s for_date) or manually on the activity edit form. Feeds the recency-penalty component of the scoring engine (lib/planner/scoring.ts) alongside weeksSinceLastProposed.';
