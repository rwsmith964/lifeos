-- LifeOS: weekend-plan one-click scheduling (D-131).
--
-- Section 9's weekend planner only ever produced a narrated markdown blob —
-- there was no way to turn "Fishing at Willamette River scores highest"
-- into an actual calendar_events row without retyping it by hand. This
-- migration is purely additive (new nullable columns only, per the
-- standing additive-contract rule): it lets generateWeekendPlan() persist
-- the *structured* winning candidate (not just its narrated text) so a
-- later "Accept plan" action can create the real event(s) from it.

-- user_activities.prep_duration_minutes: how long the prep itself takes
-- (distinct from the existing prep_lead_time_hours, which is *when before
-- the event* the prep obligation starts — see lib/brief/prep.ts). Nullable
-- because most existing activities have requires_prep=false and don't need
-- it; even requires_prep=true rows predate this column, so a sensible
-- runtime fallback duration is used by the accept flow when this is null.
alter table user_activities
  add column prep_duration_minutes integer;

-- weekend_plans: the structured form of whichever candidate the narration
-- in content_json.recommendation actually describes. All nullable — a
-- plan can still have no feasible recommendation (AI says every candidate
-- is infeasible), matching the existing content_json.recommendation: null
-- case.
alter table weekend_plans
  add column recommended_activity_id uuid references user_activities (id) on delete set null,
  add column recommended_location_id uuid references activity_locations (id) on delete set null,
  add column recommended_block_start timestamptz,
  add column recommended_block_end timestamptz,
  add column travel_minutes_each_way integer,
  -- Idempotency guard for the accept action (Section 9's "one-click"
  -- requirement without risking a double-click creating duplicate events).
  add column accepted_at timestamptz,
  add column activity_calendar_event_id uuid references calendar_events (id) on delete set null,
  add column prep_calendar_event_id uuid references calendar_events (id) on delete set null;

create index weekend_plans_recommended_activity_id_idx on weekend_plans (recommended_activity_id);
