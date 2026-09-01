-- Module 2 (leisure_planner_v2, D-118): Leisure Planner extensions.
-- Additive only, per the Additive Contract (brief Section 3): new tables +
-- one new nullable column on an existing table. No renames, no type
-- changes, no dropped columns, nothing altered on an existing default.
--
-- Scope (see /home/user/workspace/inventory-module2.md for the full
-- gap analysis this addresses):
--   1. activity_type_viability_configs -- lets a household declare which
--      viability inputs (weather/river flow/tide/solunar/odfw/travel)
--      matter for a given activity_type label, without turning
--      user_activities.activity_type into an enum or otherwise touching
--      that table. Declarative only in v1 -- the existing
--      isFishingRelevantLocation gate in lib/planner/generate.ts is left
--      exactly as-is (working code, not refactored for elegance); this
--      table is a new, independent surface a user can consult/manage.
--      See QUEUE-003.
--   2. gear_checklist_items -- per-activity or per-activity-type gear
--      checklists (confirmed entirely absent in the inventory). Mirrors
--      the opportunities table's "exactly one of two nullable FKs" pattern
--      for scoping a row to either a specific activity or a shared type
--      default.
--   3. leisure_outing_logs -- richer post-outing capture (conditions,
--      who actually came, rating, notes, which checklist items were
--      packed) than the existing last_done_at date stamp. Optionally
--      links to a Module 1 moments row (created_by writing through the
--      existing momentsRepo, never a raw insert from here).
--   4. opportunities.score_breakdown -- new nullable jsonb column so the
--      already-computed (but never persisted) 5-component score
--      breakdown (lib/planner/scoring.ts's ActivityScoreResult.breakdown)
--      can be shown to the user -- the inventory's "hard trust
--      requirement" gap. Existing rows get NULL; nothing reads this
--      column unless leisure_planner_v2 is on, so behavior with the flag
--      off is unchanged.

-- activity_type_viability_configs -------------------------------------

create table activity_type_viability_configs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  -- Normalized (lower/trim) mirror of user_activities.activity_type --
  -- deliberately not a FK to any activity row, since activity_type is
  -- free text shared by possibly many user_activities rows (e.g. two
  -- "Golf" rows before the D-084 merge) and a config should apply to the
  -- type, not one specific activity instance.
  activity_type_key text not null,
  -- Free-form tags naming which viability inputs matter for this type,
  -- e.g. {'weather','river_flow','tide','solunar','odfw'} for fishing or
  -- {'weather'} for golf. Deliberately text[] not a Postgres enum array --
  -- this is a user-declared label set, not a closed system vocabulary,
  -- and a check constraint here would fight the same "don't guess a
  -- closed vocabulary" principle behind D-020's null conditionDataScore.
  relevant_inputs text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_type_viability_configs_unique_type unique (household_id, activity_type_key)
);

create trigger activity_type_viability_configs_set_updated_at
  before update on activity_type_viability_configs
  for each row execute function set_updated_at();

create index activity_type_viability_configs_household_id_idx
  on activity_type_viability_configs (household_id);

alter table activity_type_viability_configs enable row level security;

create policy "household members read viability configs"
  on activity_type_viability_configs for select
  using (is_household_member(household_id));

create policy "owner/adult insert viability configs"
  on activity_type_viability_configs for insert
  with check (is_household_member(household_id) and household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult update viability configs"
  on activity_type_viability_configs for update
  using (household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult delete viability configs"
  on activity_type_viability_configs for delete
  using (household_role(household_id) in ('owner', 'adult'));

-- gear_checklist_items --------------------------------------------------

create table gear_checklist_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  -- Exactly one of these two is set (checked below): either this item is
  -- specific to one activity instance, or it's a shared default for every
  -- activity of a given type label. Same "exactly one of two nullable
  -- FKs" shape as opportunities.opportunities_one_target.
  user_activity_id uuid references user_activities (id) on delete cascade,
  activity_type_key text,
  item_label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gear_checklist_items_one_target check (
    (user_activity_id is not null and activity_type_key is null)
    or (user_activity_id is null and activity_type_key is not null)
  )
);

create trigger gear_checklist_items_set_updated_at
  before update on gear_checklist_items
  for each row execute function set_updated_at();

create index gear_checklist_items_household_id_idx on gear_checklist_items (household_id);
create index gear_checklist_items_user_activity_id_idx on gear_checklist_items (user_activity_id);
create index gear_checklist_items_activity_type_key_idx on gear_checklist_items (household_id, activity_type_key);

alter table gear_checklist_items enable row level security;

create policy "household members read gear checklist items"
  on gear_checklist_items for select
  using (is_household_member(household_id));

create policy "owner/adult insert gear checklist items"
  on gear_checklist_items for insert
  with check (is_household_member(household_id) and household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult update gear checklist items"
  on gear_checklist_items for update
  using (household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult delete gear checklist items"
  on gear_checklist_items for delete
  using (household_role(household_id) in ('owner', 'adult'));

-- leisure_outing_logs -----------------------------------------------------

create table leisure_outing_logs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  user_activity_id uuid not null references user_activities (id) on delete cascade,
  occurred_on date not null,
  conditions_notes text,
  companions_person_ids uuid[] not null default '{}',
  rating smallint,
  notes text,
  gear_items_packed uuid[] not null default '{}',
  -- Optional link to a Module 1 moments row -- populated by writing
  -- through the existing momentsRepo (lib/db/repositories/relationship-gift-engine.ts),
  -- never a raw insert into moments from this module's code.
  moment_id uuid references moments (id) on delete set null,
  created_by_person_id uuid references people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leisure_outing_logs_rating_range check (rating is null or rating between 1 and 5)
);

create trigger leisure_outing_logs_set_updated_at
  before update on leisure_outing_logs
  for each row execute function set_updated_at();

create index leisure_outing_logs_household_id_idx on leisure_outing_logs (household_id, occurred_on desc);
create index leisure_outing_logs_user_activity_id_idx on leisure_outing_logs (user_activity_id);

alter table leisure_outing_logs enable row level security;

create policy "household members read outing logs"
  on leisure_outing_logs for select
  using (is_household_member(household_id));

create policy "owner/adult insert outing logs"
  on leisure_outing_logs for insert
  with check (is_household_member(household_id) and household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult update outing logs"
  on leisure_outing_logs for update
  using (household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult delete outing logs"
  on leisure_outing_logs for delete
  using (household_role(household_id) in ('owner', 'adult'));

-- opportunities.score_breakdown -------------------------------------------
-- New nullable column. Existing rows: NULL. Existing readers use `select *`
-- or explicit column lists that don't need updating -- an extra nullable
-- column on a `select *` is additive by nature. Only new, flag-gated code
-- (lib/opportunities/detect.ts, behind leisure_planner_v2) ever writes a
-- non-null value here.
alter table opportunities add column score_breakdown jsonb;
