-- LifeOS D-064: recurring work schedule per person, plus one-off time-off
-- entries (vacation/sick/appointment days). Two related but distinct
-- concepts, deliberately kept as two tables:
--
-- work_schedules is a recurring WEEKLY PATTERN ("works Mon-Fri 9am-5pm"),
-- not a set of dated rows. Like custody_schedules (D-033) it's a rule, but
-- unlike custody_schedules it deliberately does NOT materialize into real
-- calendar_events/custody_blocks rows -- there's nothing to individually
-- edit/cancel/reschedule about a single Tuesday's ordinary work shift, so
-- generating and periodically regenerating thousands of rows would be
-- pure overhead. Instead, lib/calendar/work-schedule.ts computes the
-- occurrences that fall within a visible date range at render time --
-- exactly the D-062 "computed, not materialized" philosophy used for
-- birthdays, just with a weekly-recurrence rule instead of a yearly one.
--
-- time_off_entries is the opposite: specific, genuinely schedulable dated
-- rows (a real vacation Aug 30-Sep 2, a sick day tomorrow) that a person
-- adds, edits by deleting/re-adding, and removes -- so it's a real table,
-- not a computed view. It also suppresses that person's computed work
-- shifts on the days it covers (see lib/calendar/work-schedule.ts).

create table work_schedules (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id) on delete cascade,
  -- 0 = Sunday .. 6 = Saturday, matching JS Date#getDay() so the render-time
  -- occurrence generator needs no day-index translation.
  day_of_week smallint not null check (day_of_week >= 0 and day_of_week <= 6),
  start_time time not null,
  end_time time not null,
  label text not null default 'Work',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_schedules_end_after_start check (end_time > start_time)
);

create trigger work_schedules_set_updated_at
  before update on work_schedules
  for each row execute function set_updated_at();

create index work_schedules_person_id_idx on work_schedules (person_id);

alter table work_schedules enable row level security;

create policy "household members read work schedules"
  on work_schedules for select
  using (person_is_in_my_household(person_id));

create policy "owner/adult manage work schedules insert"
  on work_schedules for insert
  with check (person_household_write_role_ok(person_id));

create policy "owner/adult manage work schedules update"
  on work_schedules for update
  using (person_household_write_role_ok(person_id));

create policy "owner/adult manage work schedules delete"
  on work_schedules for delete
  using (person_household_write_role_ok(person_id));

create table time_off_entries (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text not null default '',
  -- 'quick_capture' rows came from the AI capture pipeline (D-064,
  -- app/api/capture/route.ts); 'manual' rows were added directly on the
  -- person's page. Purely informational -- same read/write rules apply
  -- either way -- kept so a future audit/debug view can tell them apart.
  source text not null default 'manual' check (source in ('manual', 'quick_capture')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_off_entries_end_after_start check (end_date >= start_date)
);

create trigger time_off_entries_set_updated_at
  before update on time_off_entries
  for each row execute function set_updated_at();

create index time_off_entries_person_id_idx on time_off_entries (person_id);
create index time_off_entries_date_range_idx on time_off_entries (start_date, end_date);

alter table time_off_entries enable row level security;

create policy "household members read time off"
  on time_off_entries for select
  using (person_is_in_my_household(person_id));

create policy "owner/adult manage time off insert"
  on time_off_entries for insert
  with check (person_household_write_role_ok(person_id));

create policy "owner/adult manage time off update"
  on time_off_entries for update
  using (person_household_write_role_ok(person_id));

create policy "owner/adult manage time off delete"
  on time_off_entries for delete
  using (person_household_write_role_ok(person_id));
