-- LifeOS: link calendar_events to the user_activity they instantiate.
--
-- Section 8.5 requires generating a prep event at prep_lead_time_hours
-- before an event, for "every user_activity with requires_prep = true" —
-- but nothing in Section 4.2 connects a calendar_event to the
-- user_activities row it's an instance of (interactions.activity_id exists
-- for logging past contact, but calendar_events has no equivalent). Without
-- it there is no reliable way to know "this Saturday afternoon block is the
-- fishing activity that needs gear packed Friday night." See DECISIONS.md
-- D-018. New migration, not an edit to 20260820000011, per Section 5.

alter table calendar_events
  add column related_activity_id uuid references user_activities (id) on delete set null;

create index calendar_events_related_activity_id_idx on calendar_events (related_activity_id);
