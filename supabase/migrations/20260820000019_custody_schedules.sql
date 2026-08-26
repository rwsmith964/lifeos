-- LifeOS: custody_schedules + custody_schedule_exceptions (Phase 2 of the
-- round-2 remediation brief — "custody is the differentiator and it is
-- the weakest module"). See DECISIONS.md D-033 for the design rationale.
--
-- custody_blocks (from 20260820000011) stays exactly as it is and remains
-- the thing every reader (calendar rendering, the person page's custody
-- card, brief generation) actually queries — this migration doesn't touch
-- any of that. A custody_schedule is a *generator*: a recurring rule that
-- materializes into ordinary custody_blocks rows for a rolling window,
-- tagged with the schedule that produced them via the new
-- custody_schedule_id column. A block with no schedule id is a one-off,
-- hand-created block (holiday swap, single exception) exactly like today.
-- Regenerating a schedule only touches blocks it produced; manually
-- created blocks are never touched by generation.

create table custody_schedules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  child_person_id uuid not null references people (id) on delete cascade,
  name text not null default '',
  -- The recurring unit: a cycle of N days, each day assigned to a
  -- responsible parent. A 7-day cycle with days 0-6 all one parent (or
  -- alternating per iteration via anchor_date math) covers "week-on/
  -- week-off"; a 14-day cycle covers "alternating weekends" and "2-2-3"
  -- (which isn't actually periodic on a 7-day cycle — its true period is
  -- 14 days). Modeling the cycle as an explicit day-by-day array, rather
  -- than a fixed enum of named patterns, is what makes this engine general
  -- instead of needing new code for every family's actual arrangement —
  -- named presets in the UI are just pre-filled cycle_assignments.
  cycle_length_days integer not null check (cycle_length_days > 0 and cycle_length_days <= 90),
  -- Array of { "dayIndex": 0..cycle_length_days-1, "responsiblePersonId": uuid }.
  -- Validated at the application layer (Zod) — Postgres just stores it.
  cycle_assignments jsonb not null,
  -- The real-world date that corresponds to dayIndex 0, so the cycle can
  -- be projected onto actual calendar dates.
  anchor_date date not null,
  handover_time time not null default '17:00',
  handover_location text,
  start_date date not null,
  -- null = ongoing/no defined end.
  end_date date,
  notes text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custody_schedules_end_after_start check (end_date is null or end_date >= start_date)
);

create trigger custody_schedules_set_updated_at
  before update on custody_schedules
  for each row execute function set_updated_at();

create index custody_schedules_household_id_idx on custody_schedules (household_id);
create index custody_schedules_child_person_id_idx on custody_schedules (child_person_id);

alter table custody_schedules enable row level security;

create policy "household members read custody schedules"
  on custody_schedules for select
  using (is_household_member(household_id));

create policy "owner/adult insert custody schedules"
  on custody_schedules for insert
  with check (is_household_member(household_id) and household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult update custody schedules"
  on custody_schedules for update
  using (household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult delete custody schedules"
  on custody_schedules for delete
  using (household_role(household_id) in ('owner', 'adult'));

-- custody_schedule_exceptions ---------------------------------------------
-- A holiday, or any other single-date override that replaces what the
-- cycle would otherwise generate for that date. Generation checks this
-- table for each date in the window before falling back to the cycle.

create table custody_schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  custody_schedule_id uuid not null references custody_schedules (id) on delete cascade,
  exception_date date not null,
  responsible_person_id uuid not null references people (id) on delete cascade,
  reason text not null default '',
  created_at timestamptz not null default now(),
  unique (custody_schedule_id, exception_date)
);

create index custody_schedule_exceptions_schedule_id_idx on custody_schedule_exceptions (custody_schedule_id);

alter table custody_schedule_exceptions enable row level security;

create policy "household members read custody exceptions"
  on custody_schedule_exceptions for select
  using (
    exists (
      select 1 from custody_schedules s
      where s.id = custody_schedule_exceptions.custody_schedule_id
        and is_household_member(s.household_id)
    )
  );

create policy "owner/adult manage custody exceptions insert"
  on custody_schedule_exceptions for insert
  with check (
    exists (
      select 1 from custody_schedules s
      where s.id = custody_schedule_exceptions.custody_schedule_id
        and household_role(s.household_id) in ('owner', 'adult')
    )
  );

create policy "owner/adult manage custody exceptions update"
  on custody_schedule_exceptions for update
  using (
    exists (
      select 1 from custody_schedules s
      where s.id = custody_schedule_exceptions.custody_schedule_id
        and household_role(s.household_id) in ('owner', 'adult')
    )
  );

create policy "owner/adult manage custody exceptions delete"
  on custody_schedule_exceptions for delete
  using (
    exists (
      select 1 from custody_schedules s
      where s.id = custody_schedule_exceptions.custody_schedule_id
        and household_role(s.household_id) in ('owner', 'adult')
    )
  );

-- custody_blocks additions --------------------------------------------
-- location: real handover location (brief 2.6/Phase 2 intro). Nullable —
-- plenty of handovers are "same place every time" and not worth re-typing.
-- custody_schedule_id: which schedule generated this block, if any.

alter table custody_blocks add column location text;
alter table custody_blocks add column custody_schedule_id uuid references custody_schedules (id) on delete set null;

create index custody_blocks_custody_schedule_id_idx on custody_blocks (custody_schedule_id);
