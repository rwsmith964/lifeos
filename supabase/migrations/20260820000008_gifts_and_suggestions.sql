-- LifeOS: gifts (historical record) and gift_suggestions (AI output).
--
-- RLS note: read access is restricted to 'owner' and 'adult' roles only,
-- unlike most other person-scoped tables which are household-readable. A
-- 'child' role person is very often the gift *recipient* on these rows —
-- letting them read the table would spoil surprises. See DECISIONS.md D-007.

create table gifts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id) on delete cascade,
  given_by_person_id uuid references people (id) on delete set null,
  occasion_type occasion_type not null,
  occasion_date date not null,
  description text not null,
  category text,
  cost_cents integer,
  status gift_status not null default 'idea',
  reaction gift_reaction,
  product_url text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger gifts_set_updated_at
  before update on gifts
  for each row execute function set_updated_at();

create index gifts_person_id_idx on gifts (person_id);
create index gifts_given_by_person_id_idx on gifts (given_by_person_id);
create index gifts_occasion_date_idx on gifts (occasion_date);

alter table gifts enable row level security;

create policy "owner/adult read gifts"
  on gifts for select
  using (person_household_write_role_ok(person_id));

create policy "owner/adult insert gifts"
  on gifts for insert
  with check (person_household_write_role_ok(person_id));

create policy "owner/adult update gifts"
  on gifts for update
  using (person_household_write_role_ok(person_id));

create policy "owner/adult delete gifts"
  on gifts for delete
  using (person_household_write_role_ok(person_id));

-- gift_suggestions ---------------------------------------------------------

create table gift_suggestions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id) on delete cascade,
  occasion_type occasion_type not null,
  occasion_date date not null,
  title text not null,
  reasoning text not null,
  price_tier price_tier not null,
  estimated_cost_cents integer not null,
  product_url text,
  retailer text,
  order_by_date date not null,
  status suggestion_status not null default 'suggested',
  generated_at timestamptz not null default now(),
  model_version text not null
);

create index gift_suggestions_person_id_idx on gift_suggestions (person_id);
create index gift_suggestions_order_by_date_idx on gift_suggestions (order_by_date);
create index gift_suggestions_status_idx on gift_suggestions (status);

alter table gift_suggestions enable row level security;

create policy "owner/adult read gift suggestions"
  on gift_suggestions for select
  using (person_household_write_role_ok(person_id));

create policy "owner/adult insert gift suggestions"
  on gift_suggestions for insert
  with check (person_household_write_role_ok(person_id));

create policy "owner/adult update gift suggestions"
  on gift_suggestions for update
  using (person_household_write_role_ok(person_id));

create policy "owner/adult delete gift suggestions"
  on gift_suggestions for delete
  using (person_household_write_role_ok(person_id));
