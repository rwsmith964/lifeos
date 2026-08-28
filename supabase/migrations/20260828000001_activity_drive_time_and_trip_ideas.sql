-- D-059: per-activity drive-time willingness (typical vs. "worth a bigger
-- trip" max) + a Trip Ideas entity for someday/bucket-list big trips with a
-- companion picker. See DECISIONS.md D-059 for the design rationale.

alter table user_activities
  add column typical_drive_minutes integer,
  add column big_trip_max_drive_minutes integer;

comment on column user_activities.typical_drive_minutes is
  'How far (minutes) the person is normally willing to drive for a routine outing of this activity.';
comment on column user_activities.big_trip_max_drive_minutes is
  'How far (minutes) the person is willing to drive for an exceptional/once-in-a-while outing of this activity (e.g. a specifically great fishing spot).';

-- trip_ideas ------------------------------------------------------------

create table trip_ideas (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  created_by_person_id uuid not null references people (id) on delete cascade,
  title text not null,
  activity_type text,
  description text,
  target_timeframe text,
  companion_person_ids uuid[] not null default '{}',
  status text not null default 'idea',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_ideas_status_valid check (status in ('idea', 'planned', 'booked', 'done', 'abandoned'))
);

create trigger trip_ideas_set_updated_at
  before update on trip_ideas
  for each row execute function set_updated_at();

create index trip_ideas_household_id_idx on trip_ideas (household_id);

alter table trip_ideas enable row level security;

create policy "household members read trip ideas"
  on trip_ideas for select
  using (is_household_member(household_id));

create policy "owner/adult insert trip ideas"
  on trip_ideas for insert
  with check (is_household_member(household_id) and household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult update trip ideas"
  on trip_ideas for update
  using (household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult delete trip ideas"
  on trip_ideas for delete
  using (household_role(household_id) in ('owner', 'adult'));
