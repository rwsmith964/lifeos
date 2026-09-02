-- Module 7 (household_layer, D-123): Household Layer.
-- Additive only, per the Additive Contract (brief Section 3). Per the
-- brief's own framing this module is "thin, last, purely defensive" --
-- commoditized meal planning / grocery / chores functionality, enough
-- that nobody can dismiss the product, not enough to distract from the
-- moat. Seven new tables, nothing altered on any existing table, column,
-- default, or constraint -- except one deliberately additive widening of
-- an existing CHECK constraint (see the intake_drafts block below), which
-- only ever adds an allowed value, never renames or removes one.
--
-- Scope (brief section, verbatim): "Meal planning with dietary
-- preferences and pantry awareness. Grocery list generation, aisle-
-- organized. Chores with assignment and completion. Recipe capture via
-- the Module 3 intake pipeline (photo of a handwritten recipe, imported
-- link)."
--
-- Deliberately NOT built (brief Section 9 -- no gold-plating the
-- household layer): no recurring-chore scheduling engine, no pantry
-- expiration alerting/notifications, no automatic grocery-list-from-
-- pantry-gap-analysis, no nutrition tracking. Just the four bullets
-- above, plumbed through the same tenant-scoped, flag-gated pattern every
-- prior module used.

-- dietary_preferences ------------------------------------------------------
-- Per-person dietary restrictions/preferences the meal planner and
-- grocery list reference. One row per (person, restriction) so a person
-- can hold several restrictions (e.g. vegetarian AND nut allergy)
-- without a delimited-string anti-pattern.

create table dietary_preferences (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  person_id uuid not null references people (id) on delete cascade,
  restriction text not null check (
    restriction in (
      'vegetarian', 'vegan', 'pescatarian', 'gluten_free', 'dairy_free',
      'nut_allergy', 'shellfish_allergy', 'egg_allergy', 'low_carb', 'kosher', 'halal', 'other'
    )
  ),
  -- Required when restriction='other' (e.g. "no cilantro"); optional
  -- free-text detail for any restriction otherwise. Enforced in
  -- application code, not a DB constraint, matching the
  -- ambiguous/needs_review precedent in Module 3 -- a DB-level
  -- conditional-required-column check would be brittle against future
  -- restriction values.
  notes text,
  created_at timestamptz not null default now(),
  unique (person_id, restriction)
);

create index dietary_preferences_household_idx on dietary_preferences (household_id);

alter table dietary_preferences enable row level security;

create policy "household members read dietary preferences"
  on dietary_preferences for select
  using (is_household_member(household_id));

create policy "household members write dietary preferences"
  on dietary_preferences for insert
  with check (is_household_member(household_id));

create policy "household members update dietary preferences"
  on dietary_preferences for update
  using (is_household_member(household_id));

create policy "household members delete dietary preferences"
  on dietary_preferences for delete
  using (is_household_member(household_id));

-- pantry_items -------------------------------------------------------------
-- What a household already has on hand. "Pantry awareness" (brief
-- verbatim) means grocery-list generation (lib/household/grocery.ts)
-- skips an ingredient line that matches an in-stock pantry item rather
-- than blindly listing every ingredient from every planned recipe --
-- nothing more automated than that (no expiration alerting, no
-- auto-reorder -- brief Section 9, no gold-plating).

create table pantry_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text not null,
  quantity text,
  aisle text not null default 'other' check (
    aisle in ('produce', 'dairy', 'meat_seafood', 'bakery', 'frozen', 'pantry', 'beverages', 'household', 'other')
  ),
  -- Nullable -- most pantry staples (flour, spices) have no meaningful
  -- expiration a household tracks; set it only for items where it
  -- matters. No alerting is built on this column in v1, it's just
  -- available for a future module to read.
  expires_on date,
  created_by_person_id uuid references people (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (household_id, name)
);

create index pantry_items_household_idx on pantry_items (household_id);

alter table pantry_items enable row level security;

create policy "household members read pantry items"
  on pantry_items for select
  using (is_household_member(household_id));

create policy "household members write pantry items"
  on pantry_items for insert
  with check (is_household_member(household_id));

create policy "household members update pantry items"
  on pantry_items for update
  using (is_household_member(household_id));

create policy "household members delete pantry items"
  on pantry_items for delete
  using (is_household_member(household_id));

-- recipes --------------------------------------------------------------
-- A household's saved recipes. Populated either directly (a household
-- member types one in) or via Module 3 intake conversion (see the
-- intake_drafts widening below and lib/intake/convert.ts's new "recipe"
-- case) -- either path is a plain insert into this table, there is no
-- separate "recipe draft" concept.

create table recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  created_by_person_id uuid references people (id) on delete set null,
  title text not null,
  -- Newline-separated ingredient lines (e.g. "2 cups flour"), not a
  -- structured jsonb array -- matches how a handwritten recipe photo or
  -- an imported link's ingredient list is naturally transcribed, and
  -- grocery-list generation (lib/household/grocery.ts) only ever needs
  -- to split on newlines, never parse quantities/units out of each line.
  ingredients text not null,
  instructions text,
  servings integer check (servings is null or servings > 0),
  -- Set when this recipe was captured from an imported link; null for a
  -- hand-typed or photo-captured recipe.
  source_url text,
  created_at timestamptz not null default now()
);

create index recipes_household_idx on recipes (household_id, created_at desc);

alter table recipes enable row level security;

create policy "household members read recipes"
  on recipes for select
  using (is_household_member(household_id));

create policy "household members write recipes"
  on recipes for insert
  with check (is_household_member(household_id));

create policy "household members update recipes"
  on recipes for update
  using (is_household_member(household_id));

create policy "household members delete recipes"
  on recipes for delete
  using (is_household_member(household_id));

-- meal_plans -------------------------------------------------------------
-- One row per (date, meal slot) a household has planned. Either points
-- at a saved recipe or holds a freeform meal name (e.g. "leftovers",
-- "eating out") -- exactly one of the two per the check constraint below,
-- matching the intake_drafts converted_table/converted_record_id pair
-- pattern for "exactly one of these two must be set".

create table meal_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  planned_date date not null,
  meal_slot text not null check (meal_slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  recipe_id uuid references recipes (id) on delete set null,
  custom_meal_name text,
  created_by_person_id uuid references people (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (household_id, planned_date, meal_slot),
  constraint meal_plans_exactly_one_meal_source check (
    (recipe_id is not null and custom_meal_name is null)
    or (recipe_id is null and custom_meal_name is not null)
  )
);

create index meal_plans_household_date_idx on meal_plans (household_id, planned_date);

alter table meal_plans enable row level security;

create policy "household members read meal plans"
  on meal_plans for select
  using (is_household_member(household_id));

create policy "household members write meal plans"
  on meal_plans for insert
  with check (is_household_member(household_id));

create policy "household members update meal plans"
  on meal_plans for update
  using (is_household_member(household_id));

create policy "household members delete meal plans"
  on meal_plans for delete
  using (is_household_member(household_id));

-- grocery_lists / grocery_list_items -------------------------------------
-- A grocery list is a named, dated collection of items, each tagged with
-- an aisle/category so the UI can render an aisle-organized list (the
-- brief's explicit requirement). "Generation" (lib/household/grocery.ts)
-- is application code that reads the household's upcoming meal_plans,
-- splits each linked recipe's ingredients into lines, and inserts one
-- grocery_list_items row per line -- there is no DB trigger or function
-- that does this automatically.

create table grocery_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  title text not null,
  -- True when this list was produced by "generate from meal plan" rather
  -- than started blank -- purely informational, doesn't change behavior.
  generated_from_meal_plan boolean not null default false,
  created_by_person_id uuid references people (id) on delete set null,
  created_at timestamptz not null default now()
);

create index grocery_lists_household_idx on grocery_lists (household_id, created_at desc);

alter table grocery_lists enable row level security;

create policy "household members read grocery lists"
  on grocery_lists for select
  using (is_household_member(household_id));

create policy "household members write grocery lists"
  on grocery_lists for insert
  with check (is_household_member(household_id));

create policy "household members update grocery lists"
  on grocery_lists for update
  using (is_household_member(household_id));

create policy "household members delete grocery lists"
  on grocery_lists for delete
  using (is_household_member(household_id));

create table grocery_list_items (
  id uuid primary key default gen_random_uuid(),
  grocery_list_id uuid not null references grocery_lists (id) on delete cascade,
  -- Denormalized alongside grocery_list_id (rather than joining through
  -- grocery_lists for every RLS check) -- same pattern already used by
  -- gifts-adjacent child tables elsewhere in the schema, so a policy here
  -- never needs a subquery into the parent table.
  household_id uuid not null references households (id) on delete cascade,
  name text not null,
  quantity text,
  aisle text not null default 'other' check (
    aisle in ('produce', 'dairy', 'meat_seafood', 'bakery', 'frozen', 'pantry', 'beverages', 'household', 'other')
  ),
  is_checked boolean not null default false,
  -- Set when this item was generated from a recipe's ingredient list, so
  -- the UI can show "from: <recipe title>" -- null for a manually-typed
  -- item.
  source_recipe_id uuid references recipes (id) on delete set null,
  created_at timestamptz not null default now()
);

create index grocery_list_items_list_idx on grocery_list_items (grocery_list_id, aisle);

alter table grocery_list_items enable row level security;

create policy "household members read grocery list items"
  on grocery_list_items for select
  using (is_household_member(household_id));

create policy "household members write grocery list items"
  on grocery_list_items for insert
  with check (is_household_member(household_id));

create policy "household members update grocery list items"
  on grocery_list_items for update
  using (is_household_member(household_id));

create policy "household members delete grocery list items"
  on grocery_list_items for delete
  using (is_household_member(household_id));

-- chores -------------------------------------------------------------------
-- Assignment and completion only, per the brief -- no recurrence engine.
-- A "recurring" chore is just a new row a household member creates again
-- after completing the last one (QUEUE-028), same posture as v1 gift
-- pipeline before any reciprocity automation existed.

create table chores (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  title text not null,
  description text,
  assigned_person_id uuid references people (id) on delete set null,
  due_date date,
  status text not null default 'open' check (status in ('open', 'done')),
  completed_by_person_id uuid references people (id) on delete set null,
  completed_at timestamptz,
  created_by_person_id uuid references people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chores_completion_pair check (
    (status = 'open' and completed_by_person_id is null and completed_at is null)
    or (status = 'done' and completed_by_person_id is not null and completed_at is not null)
  )
);

create trigger chores_set_updated_at
  before update on chores
  for each row execute function set_updated_at();

create index chores_household_status_idx on chores (household_id, status, due_date);

alter table chores enable row level security;

create policy "household members read chores"
  on chores for select
  using (is_household_member(household_id));

create policy "household members write chores"
  on chores for insert
  with check (is_household_member(household_id));

create policy "household members update chores"
  on chores for update
  using (is_household_member(household_id));

create policy "household members delete chores"
  on chores for delete
  using (is_household_member(household_id));

-- intake_drafts.detected_record_type widening ------------------------------
-- Additive widening, not a type change: adds 'recipe' as a seventh
-- allowed value on the existing CHECK constraint so Module 3's intake
-- pipeline (photo of a handwritten recipe, an imported recipe link) can
-- classify and convert a recipe draft the same way it already does for
-- calendar_event/gift_idea/person/moment/person_note/task. No existing
-- row, application code path for the six prior values, or other
-- constraint on this table is touched.
alter table intake_drafts drop constraint intake_drafts_detected_record_type_check;
alter table intake_drafts add constraint intake_drafts_detected_record_type_check check (
  detected_record_type in ('calendar_event', 'gift_idea', 'person', 'moment', 'person_note', 'task', 'recipe', 'ambiguous')
);
