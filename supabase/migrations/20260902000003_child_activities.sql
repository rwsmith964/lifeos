-- D-129: child-activity infrastructure. Per the user's explicit request,
-- this is INFRASTRUCTURE ONLY -- no real activity rows (e.g. Emlyn's real
-- Tuesday/Thursday soccer practice or Saturday games) are inserted here.
-- A household adds their own rows later via the new /people/[id] UI.
--
-- Modeled directly on work_schedules (D-064, migration
-- 20260828000005_work_schedule_and_time_off.sql): a weekly RULE, not
-- materialized calendar_events rows -- there's nothing to individually
-- edit about a single Tuesday's ordinary practice, so this stays a
-- computed-at-render-time pattern rather than generating and maintaining
-- thousands of rows, exactly like birthdays (D-062) and work shifts.
-- Nothing in this migration or this feature auto-creates calendar_events;
-- that's deliberately out of scope for now (see D-129's DECISIONS.md
-- entry).
--
-- Distinguishing feature vs. work_schedules: a child_activities row also
-- carries a location (name/address/lat/lng + a cached drive_time_minutes,
-- same shape as activity_locations from migration
-- 20260820000009_activities.sql) so a future materializer can compute
-- travel time the same way lib/brief/prep.ts already does for regular
-- events -- and attendance is mandatory/optional PER ADULT, not a single
-- household-wide flag on the activity, because the same activity can be
-- mandatory for one parent (a game) and optional for another (a practice)
-- -- exactly the user's own example. That per-adult flag reuses the
-- existing attendance_status enum (required/optional/informational) that
-- event_attendees already defined in migration
-- 20260820000011_calendar_and_custody.sql, for one shared vocabulary
-- across both concepts instead of a second bespoke enum.
create table child_activities (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  child_person_id uuid not null references people (id) on delete cascade,
  name text not null,
  activity_type text,
  -- 0 = Sunday .. 6 = Saturday, same convention as work_schedules.day_of_week
  -- (matches JS Date#getDay() so a future occurrence generator needs no
  -- day-index translation).
  day_of_week smallint not null check (day_of_week >= 0 and day_of_week <= 6),
  start_time time not null,
  end_time time not null,
  location_name text,
  location_address text,
  location_lat numeric,
  location_lng numeric,
  drive_time_minutes integer,
  notes text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint child_activities_end_after_start check (end_time > start_time)
);

create trigger child_activities_set_updated_at
  before update on child_activities
  for each row execute function set_updated_at();

create index child_activities_household_id_idx on child_activities (household_id);
create index child_activities_child_person_id_idx on child_activities (child_person_id);

create or replace function child_activity_household_id(target_child_activity_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from child_activities where id = target_child_activity_id;
$$;

alter table child_activities enable row level security;

create policy "household members read child activities"
  on child_activities for select
  using (is_household_member(household_id));

create policy "owner/adult insert child activities"
  on child_activities for insert
  with check (is_household_member(household_id) and household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult update child activities"
  on child_activities for update
  using (household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult delete child activities"
  on child_activities for delete
  using (household_role(household_id) in ('owner', 'adult'));

-- child_activity_attendance ----------------------------------------------
-- Per-adult attendance requirement for a child activity. One row per
-- (activity, adult) pair; an adult with no row is treated as "optional"
-- by every reader (see lib/custody/visibility.ts's viewerAttendanceStatus
-- fallback), same default as the column itself.
create table child_activity_attendance (
  id uuid primary key default gen_random_uuid(),
  child_activity_id uuid not null references child_activities (id) on delete cascade,
  person_id uuid not null references people (id) on delete cascade,
  attendance_status attendance_status not null default 'optional',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint child_activity_attendance_unique unique (child_activity_id, person_id)
);

create trigger child_activity_attendance_set_updated_at
  before update on child_activity_attendance
  for each row execute function set_updated_at();

create index child_activity_attendance_activity_id_idx on child_activity_attendance (child_activity_id);
create index child_activity_attendance_person_id_idx on child_activity_attendance (person_id);

alter table child_activity_attendance enable row level security;

create policy "household members read child activity attendance"
  on child_activity_attendance for select
  using (is_household_member(child_activity_household_id(child_activity_id)));

create policy "owner/adult insert child activity attendance"
  on child_activity_attendance for insert
  with check (household_role(child_activity_household_id(child_activity_id)) in ('owner', 'adult'));

create policy "owner/adult update child activity attendance"
  on child_activity_attendance for update
  using (household_role(child_activity_household_id(child_activity_id)) in ('owner', 'adult'));

create policy "owner/adult delete child activity attendance"
  on child_activity_attendance for delete
  using (household_role(child_activity_household_id(child_activity_id)) in ('owner', 'adult'));
