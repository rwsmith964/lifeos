-- LifeOS: cross-household links, for the co-parent visibility model.
-- Schema-and-RLS-only in v1 — nothing populates this table yet and there is
-- no invitation UI (Section 6.4). Built now because retrofitting RLS across
-- households later is the single most expensive thing to redo.

create table household_links (
  id uuid primary key default gen_random_uuid(),
  household_a_id uuid not null references households (id) on delete cascade,
  household_b_id uuid not null references households (id) on delete cascade,
  link_type household_link_type not null default 'co_parenting',
  status household_link_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (household_a_id <> household_b_id)
);

-- Store each unordered pair once regardless of which side initiated it.
create unique index household_links_unordered_pair_idx
  on household_links (least(household_a_id, household_b_id), greatest(household_a_id, household_b_id));

create index household_links_household_a_idx on household_links (household_a_id);
create index household_links_household_b_idx on household_links (household_b_id);

create trigger household_links_set_updated_at
  before update on household_links
  for each row execute function set_updated_at();
