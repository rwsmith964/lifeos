-- LifeOS: user_activities (Richard's hobbies) and activity_locations.

create table user_activities (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  person_id uuid not null references people (id) on delete cascade,
  activity_type text not null,
  enjoyment_rank integer not null,
  typical_duration_minutes integer not null,
  requires_prep boolean not null default false,
  prep_lead_time_hours integer,
  preferred_companions uuid[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_activities_enjoyment_rank_range check (enjoyment_rank between 1 and 10)
);

create trigger user_activities_set_updated_at
  before update on user_activities
  for each row execute function set_updated_at();

create index user_activities_household_id_idx on user_activities (household_id);
create index user_activities_person_id_idx on user_activities (person_id);

create or replace function activity_household_id(target_activity_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from user_activities where id = target_activity_id;
$$;

alter table user_activities enable row level security;

create policy "household members read activities"
  on user_activities for select
  using (is_household_member(household_id));

create policy "owner/adult insert activities"
  on user_activities for insert
  with check (is_household_member(household_id) and household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult update activities"
  on user_activities for update
  using (household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult delete activities"
  on user_activities for delete
  using (household_role(household_id) in ('owner', 'adult'));

-- activity_locations --------------------------------------------------

create table activity_locations (
  id uuid primary key default gen_random_uuid(),
  user_activity_id uuid not null references user_activities (id) on delete cascade,
  name text not null,
  address text,
  lat numeric,
  lng numeric,
  drive_time_minutes integer,
  notes text not null default '',
  external_ids jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger activity_locations_set_updated_at
  before update on activity_locations
  for each row execute function set_updated_at();

create index activity_locations_user_activity_id_idx on activity_locations (user_activity_id);
create index activity_locations_external_ids_idx on activity_locations using gin (external_ids);

alter table activity_locations enable row level security;

create policy "household members read activity locations"
  on activity_locations for select
  using (is_household_member(activity_household_id(user_activity_id)));

create policy "owner/adult insert activity locations"
  on activity_locations for insert
  with check (household_role(activity_household_id(user_activity_id)) in ('owner', 'adult'));

create policy "owner/adult update activity locations"
  on activity_locations for update
  using (household_role(activity_household_id(user_activity_id)) in ('owner', 'adult'));

create policy "owner/adult delete activity locations"
  on activity_locations for delete
  using (household_role(activity_household_id(user_activity_id)) in ('owner', 'adult'));
