-- D-139 (packing_checklist_v2, roadmap R-2): packing checklist wizard.
-- Richard's original ask: "a feature where you can build in travel packing
-- checklists where it asks questions about what type of trip and what
-- activities you will be doing and formulates a list based on that." The
-- existing gear_checklist_items table (Module 2, D-118) is scoped to a
-- single *local activity instance* (e.g. "bring waders for this fishing
-- outing"), not a multi-day trip -- this is a new, separate concept: a
-- checklist tied to a trip (optional dates/destination/travelers), not an
-- activity.
--
-- Additive Contract: two new tables, nothing existing touched. Ships behind
-- a new feature flag (packing_checklist_v2, added in the same commit to
-- lib/flags.ts) -- with the flag off, /packing doesn't even render a nav
-- link, so this has zero effect on current behavior until enabled.

-- packing_lists -------------------------------------------------------------

create table packing_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  -- Who created/owns this list, for display ("Richard's trip") -- nullable
  -- so a list survives if that person record is ever removed (on delete
  -- set null, not cascade: the packing list itself is still useful even if
  -- its creator record goes away, unlike gear_checklist_items which is
  -- meaningless without its parent activity).
  created_by_person_id uuid references people (id) on delete set null,
  title text not null,
  trip_type text not null default 'other' check (
    trip_type in ('beach', 'city', 'camping', 'ski_snow', 'road_trip', 'visiting_family', 'international', 'business', 'other')
  ),
  start_date date,
  end_date date,
  -- Free-text, same shape as time_off_entries.destination (D-135) -- kept
  -- consistent rather than inventing a second destination representation.
  destination text,
  -- Which people in the household are going on this trip, for context (the
  -- AI checklist generator uses ages/relationship_type to include
  -- kid-specific items). Not a join table: a packing list's traveler set
  -- is fixed at creation time and edited as a whole, not queried
  -- independently of its list, so an array column matches
  -- leisure_outing_logs.companions_person_ids' precedent rather than
  -- adding a fourth table for this module.
  traveler_person_ids uuid[] not null default '{}',
  -- Free-text notes on planned activities, entered in the wizard (e.g.
  -- "hiking, one nice dinner out") -- the direct input the checklist
  -- generator reasons over, per Richard's "what activities you will be
  -- doing" ask.
  planned_activities text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint packing_lists_end_after_start check (end_date is null or start_date is null or end_date >= start_date)
);

create trigger packing_lists_set_updated_at
  before update on packing_lists
  for each row execute function set_updated_at();

create index packing_lists_household_id_idx on packing_lists (household_id);
create index packing_lists_created_by_person_id_idx on packing_lists (created_by_person_id);

alter table packing_lists enable row level security;

-- Same owner/adult-write, household-member-read split as gear_checklist_items
-- and feature_flags: a packing list is trip planning, not a moment-to-moment
-- household action, and every other module-flagged table to date uses this
-- same split.
create policy "household members read packing lists"
  on packing_lists for select
  using (is_household_member(household_id));

create policy "owner/adult create packing lists"
  on packing_lists for insert
  with check (is_household_member(household_id) and household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult update packing lists"
  on packing_lists for update
  using (household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult delete packing lists"
  on packing_lists for delete
  using (household_role(household_id) in ('owner', 'adult'));

-- packing_list_items ---------------------------------------------------------

create table packing_list_items (
  id uuid primary key default gen_random_uuid(),
  -- Denormalized (same call as gear_checklist_items.household_id) so this
  -- table's own RLS policies don't need a subquery join through
  -- packing_lists for every row check.
  household_id uuid not null references households (id) on delete cascade,
  packing_list_id uuid not null references packing_lists (id) on delete cascade,
  label text not null,
  category text,
  checked boolean not null default false,
  sort_order integer not null default 0,
  -- 'ai' rows came from the wizard's generated checklist; 'manual' rows
  -- were added afterward on the list's own page. Same informational-only
  -- distinction as time_off_entries.source -- same read/write rules apply
  -- either way.
  source text not null default 'manual' check (source in ('ai', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger packing_list_items_set_updated_at
  before update on packing_list_items
  for each row execute function set_updated_at();

create index packing_list_items_household_id_idx on packing_list_items (household_id);
create index packing_list_items_packing_list_id_idx on packing_list_items (packing_list_id);

alter table packing_list_items enable row level security;

create policy "household members read packing list items"
  on packing_list_items for select
  using (is_household_member(household_id));

create policy "owner/adult create packing list items"
  on packing_list_items for insert
  with check (is_household_member(household_id) and household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult update packing list items"
  on packing_list_items for update
  using (household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult delete packing list items"
  on packing_list_items for delete
  using (household_role(household_id) in ('owner', 'adult'));
