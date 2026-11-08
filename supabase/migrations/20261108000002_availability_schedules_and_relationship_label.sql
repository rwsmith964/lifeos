-- LifeOS: availability_schedules + people.relationship_label.
--
-- availability_schedules: a recurring pattern attached to one person that
-- says when they are busy (kind 'busy' -- e.g. a girlfriend's kids' weeks,
-- entered without any of her kids' details) or in school (kind 'school' --
-- Mon-Fri 8:00-3:00 with breaks). It is a *generator* like custody_schedules
-- but deliberately lighter: nothing is materialized into rows; the calendar
-- and the weekend planner expand the pattern for whatever window they are
-- looking at (lib/availability/expand.ts).
--
-- people.relationship_label: a free-text label shown in place of the generic
-- relationship type -- "Girlfriend", "Boyfriend", "Fiance" -- so a
-- relationship_type of 'partner' can read the way people actually talk. No
-- enum change, so nothing that branches on relationship_type is affected.

alter table people add column relationship_label text;

create table availability_schedules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  person_id uuid not null references people (id) on delete cascade,
  kind text not null check (kind in ('busy', 'school')),
  label text not null default '',
  -- 7 = the same every week, 14 = alternating weeks.
  cycle_length_days integer not null check (cycle_length_days in (7, 14)),
  -- Array of { "dayIndex": 0..cycle_length_days-1, "startTime": "HH:MM"|null,
  -- "endTime": "HH:MM"|null }. A day appears here only if it is active; null
  -- times mean all day. Validated in the application layer (Zod).
  pattern jsonb not null,
  -- The real-world date that corresponds to dayIndex 0.
  anchor_date date not null,
  start_date date not null,
  -- null = ongoing.
  end_date date,
  -- Array of { "start": date, "end": date, "label": text }: ranges where the
  -- pattern does not apply (school breaks, a week she is free).
  skip_ranges jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint availability_schedules_end_after_start check (end_date is null or end_date >= start_date)
);

create trigger availability_schedules_set_updated_at
  before update on availability_schedules
  for each row execute function set_updated_at();

create index availability_schedules_household_id_idx on availability_schedules (household_id);
create index availability_schedules_person_id_idx on availability_schedules (person_id);

alter table availability_schedules enable row level security;

create policy "household members read availability schedules"
  on availability_schedules for select
  using (is_household_member(household_id));

create policy "owner/adult insert availability schedules"
  on availability_schedules for insert
  with check (
    household_role(household_id) in ('owner', 'adult')
    and exists (select 1 from people p where p.id = availability_schedules.person_id and p.household_id = availability_schedules.household_id)
  );

create policy "owner/adult update availability schedules"
  on availability_schedules for update
  using (household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult delete availability schedules"
  on availability_schedules for delete
  using (household_role(household_id) in ('owner', 'adult'));
