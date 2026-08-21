-- LifeOS: people — THE SPINE (Section 4.2, 2.2). Every human the system
-- knows about. A person may or may not have a user account.

create table people (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  user_id uuid references users (id) on delete set null,
  full_name text not null,
  nickname text,
  relationship_type relationship_type not null,
  birthdate date,
  birth_year_known boolean not null default true,
  anniversary date,
  phone text,
  email text,
  photo_url text,
  notes text not null default '',
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger people_set_updated_at
  before update on people
  for each row execute function set_updated_at();

create index people_household_id_idx on people (household_id);
create index people_user_id_idx on people (user_id);
-- Month/day expression index for the birthday scan (Section 4.3) — most
-- people have no known birth year, so we scan on month/day, not full date.
create index people_birthdate_month_day_idx
  on people (extract(month from birthdate), extract(day from birthdate))
  where birthdate is not null and is_archived = false;
create index people_anniversary_month_day_idx
  on people (extract(month from anniversary), extract(day from anniversary))
  where anniversary is not null and is_archived = false;

-- Reused by every table below that hangs off person_id rather than
-- household_id directly (person_interests, gifts, contact_cadences, ...).
create or replace function person_is_in_my_household(target_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from people p
    where p.id = target_person_id
      and is_household_member(p.household_id)
  );
$$;

create or replace function person_household_write_role_ok(target_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from people p
    where p.id = target_person_id
      and household_role(p.household_id) in ('owner', 'adult')
  );
$$;

alter table people enable row level security;

create policy "household members read people"
  on people for select
  using (is_household_member(household_id));

create policy "owner/adult manage people"
  on people for insert
  with check (is_household_member(household_id) and household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult update people"
  on people for update
  using (household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult delete people"
  on people for delete
  using (household_role(household_id) in ('owner', 'adult'));
