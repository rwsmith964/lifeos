-- LifeOS: person_interests and person_gift_budgets.

create table person_interests (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id) on delete cascade,
  interest text not null,
  category text,
  strength interest_strength not null default 'casual',
  source interest_source not null default 'manual',
  noted_at date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_interests_interest_normalized check (interest = lower(interest))
);

create trigger person_interests_set_updated_at
  before update on person_interests
  for each row execute function set_updated_at();

create index person_interests_person_id_idx on person_interests (person_id);
create unique index person_interests_person_interest_unique
  on person_interests (person_id, interest);

alter table person_interests enable row level security;

create policy "household members read interests"
  on person_interests for select
  using (person_is_in_my_household(person_id));

create policy "owner/adult manage interests insert"
  on person_interests for insert
  with check (person_household_write_role_ok(person_id));

create policy "owner/adult manage interests update"
  on person_interests for update
  using (person_household_write_role_ok(person_id));

create policy "owner/adult manage interests delete"
  on person_interests for delete
  using (person_household_write_role_ok(person_id));

-- person_gift_budgets ----------------------------------------------------
-- Resolution order at suggestion time (Section 4.2): person + specific
-- occasion -> person + 'default' -> household default -> hardcoded fallback.

create table person_gift_budgets (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id) on delete cascade,
  occasion_type occasion_type not null default 'default',
  min_cents integer not null,
  max_cents integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_gift_budgets_range_valid check (min_cents >= 0 and max_cents >= min_cents)
);

create trigger person_gift_budgets_set_updated_at
  before update on person_gift_budgets
  for each row execute function set_updated_at();

create index person_gift_budgets_person_id_idx on person_gift_budgets (person_id);
create unique index person_gift_budgets_person_occasion_unique
  on person_gift_budgets (person_id, occasion_type);

alter table person_gift_budgets enable row level security;

create policy "household members read budgets"
  on person_gift_budgets for select
  using (person_is_in_my_household(person_id));

create policy "owner/adult manage budgets insert"
  on person_gift_budgets for insert
  with check (person_household_write_role_ok(person_id));

create policy "owner/adult manage budgets update"
  on person_gift_budgets for update
  using (person_household_write_role_ok(person_id));

create policy "owner/adult manage budgets delete"
  on person_gift_budgets for delete
  using (person_household_write_role_ok(person_id));
