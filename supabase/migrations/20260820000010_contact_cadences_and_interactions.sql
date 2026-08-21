-- LifeOS: contact_cadences ("you haven't golfed with Mike since April") and
-- the interactions log that feeds last_contact_date.

create table contact_cadences (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id) on delete cascade,
  target_interval_days integer not null,
  last_contact_date date,
  last_contact_type contact_type,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger contact_cadences_set_updated_at
  before update on contact_cadences
  for each row execute function set_updated_at();

create unique index contact_cadences_person_id_unique on contact_cadences (person_id);

alter table contact_cadences enable row level security;

create policy "household members read cadences"
  on contact_cadences for select
  using (person_is_in_my_household(person_id));

create policy "owner/adult insert cadences"
  on contact_cadences for insert
  with check (person_household_write_role_ok(person_id));

create policy "owner/adult update cadences"
  on contact_cadences for update
  using (person_household_write_role_ok(person_id));

create policy "owner/adult delete cadences"
  on contact_cadences for delete
  using (person_household_write_role_ok(person_id));

-- interactions -----------------------------------------------------------

create table interactions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id) on delete cascade,
  interaction_type contact_type not null,
  occurred_on date not null,
  notes text,
  activity_id uuid references user_activities (id) on delete set null,
  created_at timestamptz not null default now()
);

create index interactions_person_id_idx on interactions (person_id);
create index interactions_occurred_on_idx on interactions (occurred_on);

alter table interactions enable row level security;

create policy "household members read interactions"
  on interactions for select
  using (person_is_in_my_household(person_id));

create policy "owner/adult insert interactions"
  on interactions for insert
  with check (person_household_write_role_ok(person_id));

create policy "owner/adult update interactions"
  on interactions for update
  using (person_household_write_role_ok(person_id));

create policy "owner/adult delete interactions"
  on interactions for delete
  using (person_household_write_role_ok(person_id));

-- Keep contact_cadences.last_contact_date / last_contact_type in sync with
-- the most recent interaction, so the cadence-overdue calculation always
-- reads a fresh value without re-aggregating interactions on every brief run.
create or replace function sync_contact_cadence_from_interaction()
returns trigger
language plpgsql
as $$
begin
  update contact_cadences
  set last_contact_date = new.occurred_on,
      last_contact_type = new.interaction_type
  where person_id = new.person_id
    and (last_contact_date is null or new.occurred_on > last_contact_date);
  return new;
end;
$$;

create trigger interactions_sync_cadence
  after insert on interactions
  for each row execute function sync_contact_cadence_from_interaction();
