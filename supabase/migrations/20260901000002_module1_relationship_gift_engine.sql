-- Build Brief Module 1: Relationship & Gift Engine.
-- All gated behind the `relationship_gift_engine_v2` feature flag (see
-- lib/flags.ts) -- these tables exist and are RLS-reachable regardless of
-- flag state (Postgres has no concept of a "disabled table"), but no
-- existing route/component reads or writes them, and the new write paths
-- this module adds all check isFeatureEnabled() before touching them. With
-- the flag off, the app behaves identically to before this migration.
--
-- Additive Contract: every item below is either a brand-new table or a new
-- nullable column on an existing table. Nothing existing is renamed,
-- retyped, dropped, or has its default changed. Row level security on every
-- new table follows the exact patterns already established for
-- person_interests / person_gift_budgets (person-scoped, via
-- person_is_in_my_household / person_household_write_role_ok) and gifts /
-- gift_suggestions (owner/adult-only, spoiler safety D-007) -- reusing the
-- existing security-definer helper functions rather than inventing new
-- ones.

-- person_profile_details -----------------------------------------------
-- One extended-profile row per person (Phase 0 Q2: food prefs, sizes,
-- brands, and "how we met" were entirely missing -- people.notes is the
-- only existing catch-all and is unstructured). All columns nullable; a
-- person with no row here (the default for every existing person) behaves
-- exactly as today.
create table person_profile_details (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id) on delete cascade,
  food_preferences text,
  clothing_size text,
  shoe_size text,
  ring_size text,
  preferred_brands text,
  how_we_met text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id)
);

create trigger person_profile_details_set_updated_at
  before update on person_profile_details
  for each row execute function set_updated_at();

create index person_profile_details_person_id_idx on person_profile_details (person_id);

alter table person_profile_details enable row level security;

create policy "household members read profile details"
  on person_profile_details for select
  using (person_is_in_my_household(person_id));

create policy "owner/adult manage profile details insert"
  on person_profile_details for insert
  with check (person_household_write_role_ok(person_id));

create policy "owner/adult manage profile details update"
  on person_profile_details for update
  using (person_household_write_role_ok(person_id));

create policy "owner/adult manage profile details delete"
  on person_profile_details for delete
  using (person_household_write_role_ok(person_id));

-- person_wishlist_items ---------------------------------------------------
-- "Things they've mentioned wanting" (Phase 0 Q2) -- distinct from
-- person_interests (ongoing hobbies/tastes): a wishlist item is a specific
-- thing, usually sourced from a conversation, that's a gift candidate.
create table person_wishlist_items (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id) on delete cascade,
  item text not null,
  source text not null default 'manual',
  noted_at date not null default current_date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_wishlist_items_source_valid check (source in ('manual', 'conversation_log'))
);

create trigger person_wishlist_items_set_updated_at
  before update on person_wishlist_items
  for each row execute function set_updated_at();

create index person_wishlist_items_person_id_idx on person_wishlist_items (person_id);

alter table person_wishlist_items enable row level security;

create policy "household members read wishlist items"
  on person_wishlist_items for select
  using (person_is_in_my_household(person_id));

create policy "owner/adult manage wishlist items insert"
  on person_wishlist_items for insert
  with check (person_household_write_role_ok(person_id));

create policy "owner/adult manage wishlist items update"
  on person_wishlist_items for update
  using (person_household_write_role_ok(person_id));

create policy "owner/adult manage wishlist items delete"
  on person_wishlist_items for delete
  using (person_household_write_role_ok(person_id));

-- person_relationships -----------------------------------------------------
-- Relation graph *between* people (Phase 0 Q2: "Dave's wife is Jane") --
-- distinct from people.relationship_type, which only records a person's
-- relation to the household. related_person_id is nullable because the
-- related person (e.g. a friend's spouse) frequently has no people row of
-- their own; related_name always carries the display name regardless.
create table person_relationships (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id) on delete cascade,
  related_person_id uuid references people (id) on delete set null,
  related_name text not null,
  relation_label text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger person_relationships_set_updated_at
  before update on person_relationships
  for each row execute function set_updated_at();

create index person_relationships_person_id_idx on person_relationships (person_id);
create index person_relationships_related_person_id_idx on person_relationships (related_person_id);

alter table person_relationships enable row level security;

create policy "household members read person relationships"
  on person_relationships for select
  using (person_is_in_my_household(person_id));

create policy "owner/adult manage person relationships insert"
  on person_relationships for insert
  with check (person_household_write_role_ok(person_id));

create policy "owner/adult manage person relationships update"
  on person_relationships for update
  using (person_household_write_role_ok(person_id));

create policy "owner/adult manage person relationships delete"
  on person_relationships for delete
  using (person_household_write_role_ok(person_id));

-- conversation_log_entries -------------------------------------------------
-- The real conversation log (Phase 0 Q3: confirmed entirely missing --
-- interactions.notes exists but the only writer never populates it and the
-- table is oriented around contact-cadence timestamps, not content).
create table conversation_log_entries (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id) on delete cascade,
  entry_date date not null default current_date,
  content text not null,
  source text not null default 'manual',
  logged_by_person_id uuid references people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversation_log_entries_source_valid check (source in ('manual', 'overheard', 'inferred'))
);

create trigger conversation_log_entries_set_updated_at
  before update on conversation_log_entries
  for each row execute function set_updated_at();

create index conversation_log_entries_person_id_idx on conversation_log_entries (person_id, entry_date desc);

alter table conversation_log_entries enable row level security;

create policy "household members read conversation log"
  on conversation_log_entries for select
  using (person_is_in_my_household(person_id));

create policy "owner/adult manage conversation log insert"
  on conversation_log_entries for insert
  with check (person_household_write_role_ok(person_id));

create policy "owner/adult manage conversation log update"
  on conversation_log_entries for update
  using (person_household_write_role_ok(person_id));

create policy "owner/adult manage conversation log delete"
  on conversation_log_entries for delete
  using (person_household_write_role_ok(person_id));

-- moments -------------------------------------------------------------------
-- Retrospective multi-person event capture (Phase 0 Q4: confirmed missing
-- in its entirety -- trip_ideas is prospective/planning-oriented with no
-- real date and no place field; this is its retrospective counterpart).
-- Household-scoped directly (not person-scoped) since a moment spans
-- multiple people, mirroring trip_ideas' own household_id + companion-array
-- shape.
create table moments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  title text not null,
  occurred_on date not null,
  place text,
  notes text,
  participant_person_ids uuid[] not null default '{}',
  created_by_person_id uuid references people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger moments_set_updated_at
  before update on moments
  for each row execute function set_updated_at();

create index moments_household_id_idx on moments (household_id, occurred_on desc);

alter table moments enable row level security;

create policy "household members read moments"
  on moments for select
  using (is_household_member(household_id));

create policy "owner/adult manage moments insert"
  on moments for insert
  with check (is_household_member(household_id) and household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult manage moments update"
  on moments for update
  using (household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult manage moments delete"
  on moments for delete
  using (household_role(household_id) in ('owner', 'adult'));

-- gift_suggestions.pipeline_stage -----------------------------------------
-- The brief's 7-state idea->shortlisted->decided->ordered->shipped->
-- arrived->given pipeline, added as a new NULLABLE column rather than by
-- altering the existing, actively-used `suggestion_status` enum (Phase 0
-- Q1: suggested/saved/ordered/dismissed/converted_to_gift is a real,
-- working state machine -- touching it risks every existing status-branch
-- in lib/gifts/*.ts and app/(app)/gifts/actions.ts). `status` remains the
-- single source of truth for existing behavior; `pipeline_stage` is a
-- purely additive enrichment column that new (flagged) code populates
-- alongside it and old code never reads or writes, so leaving it null
-- (the default for every existing row) changes nothing observable today.
alter table gift_suggestions
  add column pipeline_stage text,
  add constraint gift_suggestions_pipeline_stage_valid check (
    pipeline_stage is null or pipeline_stage in (
      'idea', 'shortlisted', 'decided', 'ordered', 'shipped', 'arrived', 'given'
    )
  );

-- gift_reciprocity_entries --------------------------------------------------
-- Reciprocity ledger (Phase 0 Q6: confirmed missing in its entirety --
-- gifts.given_by_person_id only distinguishes which household member gave
-- an outgoing gift, there was no tracking of gifts received *from* other
-- people, no running balance, and no outstanding-promise concept).
-- Household-scoped like moments/gifts's spoiler-safety posture: gift-
-- adjacent household financial/social data, so mirrors gifts' owner/adult
-- -only RLS on every operation including SELECT (D-007) rather than the
-- broader household-member-read pattern used for wishlist/profile/log.
create table gift_reciprocity_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  person_id uuid not null references people (id) on delete cascade,
  direction text not null,
  description text not null,
  occasion_type occasion_type,
  occurred_on date,
  is_promise boolean not null default false,
  promise_due_date date,
  fulfilled_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gift_reciprocity_entries_direction_valid check (direction in ('given_to_them', 'received_from_them'))
);

create trigger gift_reciprocity_entries_set_updated_at
  before update on gift_reciprocity_entries
  for each row execute function set_updated_at();

create index gift_reciprocity_entries_household_id_idx on gift_reciprocity_entries (household_id);
create index gift_reciprocity_entries_person_id_idx on gift_reciprocity_entries (person_id);

alter table gift_reciprocity_entries enable row level security;

create policy "owner/adult read reciprocity entries"
  on gift_reciprocity_entries for select
  using (person_household_write_role_ok(person_id));

create policy "owner/adult insert reciprocity entries"
  on gift_reciprocity_entries for insert
  with check (person_household_write_role_ok(person_id));

create policy "owner/adult update reciprocity entries"
  on gift_reciprocity_entries for update
  using (person_household_write_role_ok(person_id));

create policy "owner/adult delete reciprocity entries"
  on gift_reciprocity_entries for delete
  using (person_household_write_role_ok(person_id));
