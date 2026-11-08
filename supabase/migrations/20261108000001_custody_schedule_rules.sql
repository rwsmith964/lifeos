-- LifeOS: custody_schedule_rules -- repeating variations to a custody
-- schedule's normal pattern, e.g. "the other parent has the kids on the first
-- Saturday of every month." custody_schedule_exceptions only covers one
-- specific date at a time; this is the same override ("this whole day belongs
-- to X instead of whatever the cycle says") expressed as a rule that recurs.
-- Generation (lib/custody/materialize.ts) expands each rule into concrete
-- dates for its window and treats them exactly like single-date exceptions;
-- an explicit single-date exception on the same day still wins.

create table custody_schedule_rules (
  id uuid primary key default gen_random_uuid(),
  custody_schedule_id uuid not null references custody_schedules (id) on delete cascade,
  -- Which occurrence of the weekday within the month: 1-4 = first..fourth,
  -- -1 = the last one.
  ordinal integer not null check (ordinal in (1, 2, 3, 4, -1)),
  -- 0 = Sunday .. 6 = Saturday (same numbering as weekly_segments).
  day_of_week integer not null check (day_of_week between 0 and 6),
  responsible_person_id uuid not null references people (id) on delete cascade,
  reason text not null default '',
  created_at timestamptz not null default now(),
  unique (custody_schedule_id, ordinal, day_of_week)
);

create index custody_schedule_rules_schedule_id_idx on custody_schedule_rules (custody_schedule_id);

alter table custody_schedule_rules enable row level security;

create policy "household members read custody rules"
  on custody_schedule_rules for select
  using (
    exists (
      select 1 from custody_schedules s
      where s.id = custody_schedule_rules.custody_schedule_id
        and is_household_member(s.household_id)
    )
  );

create policy "owner/adult manage custody rules insert"
  on custody_schedule_rules for insert
  with check (
    exists (
      select 1 from custody_schedules s
      where s.id = custody_schedule_rules.custody_schedule_id
        and household_role(s.household_id) in ('owner', 'adult')
    )
  );

create policy "owner/adult manage custody rules update"
  on custody_schedule_rules for update
  using (
    exists (
      select 1 from custody_schedules s
      where s.id = custody_schedule_rules.custody_schedule_id
        and household_role(s.household_id) in ('owner', 'adult')
    )
  );

create policy "owner/adult manage custody rules delete"
  on custody_schedule_rules for delete
  using (
    exists (
      select 1 from custody_schedules s
      where s.id = custody_schedule_rules.custody_schedule_id
        and household_role(s.household_id) in ('owner', 'adult')
    )
  );
