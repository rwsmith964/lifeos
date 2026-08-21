-- LifeOS: tenant boundary, user profiles, household membership.

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- households: the tenant boundary. Every other row in the system belongs to
-- exactly one household (see Section 4.1 of the build doc).
create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- "household default" tier of the gift-budget resolution order
  -- (Section 4.2 person_gift_budgets note; no dedicated table was specified
  -- for this tier, see DECISIONS.md D-005).
  default_gift_budget_min_cents integer,
  default_gift_budget_max_cents integer,
  -- Section 7.1: rolling horizon for the occasion scan, configurable per household.
  gift_scan_horizon_days integer not null default 60,
  gift_prompt_buffer_days integer not null default 7,
  -- Section 11.3: per-household daily AI spend ceiling.
  ai_daily_spend_ceiling_cents integer not null default 50,
  -- Section 10.5: local brief delivery time, interpreted in the household
  -- owner's timezone at generation time.
  brief_time text not null default '06:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger households_set_updated_at
  before update on households
  for each row execute function set_updated_at();

-- users: extends auth.users with LifeOS-specific profile fields.
create table users (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  home_address text,
  home_lat numeric,
  home_lng numeric,
  timezone text not null default 'America/Los_Angeles',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger users_set_updated_at
  before update on users
  for each row execute function set_updated_at();

-- Mirror every new auth.users row into public.users so FKs elsewhere always
-- have a profile row to point at. Onboarding (household creation/joining)
-- happens in the app layer, not here — see DECISIONS.md D-006.
create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- household_members: join table. A user can belong to multiple households,
-- which is how co-parenting eventually works (the kids exist in both).
create table household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  role household_role not null default 'adult',
  created_at timestamptz not null default now(),
  unique (household_id, user_id)
);

create index household_members_household_id_idx on household_members (household_id);
create index household_members_user_id_idx on household_members (user_id);
