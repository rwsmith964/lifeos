-- Module 6 (execution_draft_only, D-122): Execution (draft-only in v1).
-- Additive only, per the Additive Contract (brief Section 3): four new
-- tables, nothing altered on any existing table, column, default, or
-- constraint.
--
-- Scope (brief's verbatim Module 6 section): the assistant gets its own
-- address so it can be CC'd/forwarded to, and can draft replies on the
-- household's behalf. Tiered autonomy is set per contact and per
-- category: draft-only -> send-with-approval -> send-autonomously.
-- Default AND ONLY ENABLED VALUE IN V1 IS draft-only -- nothing in this
-- migration or the application code built on top of it ever sends
-- anything; every row this schema produces is a proposal sitting in a
-- household review queue until a human acts on it directly (copy/send
-- themselves), same spirit as intake_drafts (Module 3) never writing
-- anywhere except through a human-approved conversion.
--
-- Scope is narrow per the brief: rsvp, reschedule, confirmation,
-- gift_order categories only. Hard exclusion: nothing client-facing --
-- see contact_execution_settings below for how that's enforced as an
-- allowlist (default excluded), not a blocklist.

-- execution_categories -----------------------------------------------------
-- Household-level allowlist of which categories may ever produce a draft.
-- Per the brief ("build a category allowlist, not a blocklist, and
-- default to excluded"), a category with no row here -- the default state
-- for every household -- is NOT allowed. A household must explicitly
-- enable each category it wants drafts for, even with execution_draft_only
-- turned on.

create table execution_categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  category text not null check (
    category in ('rsvp', 'reschedule', 'confirmation', 'gift_order')
  ),
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, category)
);

create trigger execution_categories_set_updated_at
  before update on execution_categories
  for each row execute function set_updated_at();

alter table execution_categories enable row level security;

-- Policy-level household setting -- same "owner/adult manage, everyone
-- reads" pattern as activity_type_viability_configs and calendar_feeds,
-- since which categories the household's assistant may ever draft into
-- is a household-security decision, not a per-member preference.
create policy "household members read execution categories"
  on execution_categories for select
  using (is_household_member(household_id));

create policy "owner/adult manage execution categories"
  on execution_categories for all
  using (household_role(household_id) in ('owner', 'adult'))
  with check (household_role(household_id) in ('owner', 'adult'));

-- contact_execution_settings ------------------------------------------------
-- Per-contact autonomy tier and the hard client-facing exclusion. A
-- contact with no row here defaults to autonomy_tier='draft_only' (the
-- only tier this codebase acts on in v1) and is_business_contact=false,
-- EXCEPT relationship_type='colleague' people, which
-- effective_is_business_contact() below always treats as excluded
-- regardless of any row/override here -- a household member can mark any
-- OTHER relationship type as a business contact to exclude them too
-- (e.g. a "friend" who is also a client), but can never mark a colleague
-- as includable. That asymmetry is intentional: it is the "hard
-- exclusion" the brief asks for, not a togglable preference.
create table contact_execution_settings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  person_id uuid not null references people (id) on delete cascade,
  autonomy_tier text not null default 'draft_only' check (
    autonomy_tier in ('draft_only', 'send_with_approval', 'send_autonomously')
  ),
  -- Explicit override marking this person as business/client-facing even
  -- when their relationship_type isn't 'colleague' -- e.g. a friend who
  -- is also a client. Cannot be used to un-exclude a colleague; see
  -- effective_is_business_contact().
  is_business_contact boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, person_id)
);

create trigger contact_execution_settings_set_updated_at
  before update on contact_execution_settings
  for each row execute function set_updated_at();

alter table contact_execution_settings enable row level security;

create policy "household members read contact execution settings"
  on contact_execution_settings for select
  using (is_household_member(household_id));

create policy "owner/adult manage contact execution settings"
  on contact_execution_settings for all
  using (household_role(household_id) in ('owner', 'adult'))
  with check (household_role(household_id) in ('owner', 'adult'));

-- execution_drafts -----------------------------------------------------------
-- The actual proposed drafts -- a household-shared review queue, same
-- collaborative-inbox shape as intake_drafts (Module 3). Nothing in this
-- table, or any function that writes to it, ever sends anything: v1's
-- only actions on a row are "approve" (record that a human said this
-- looks right; the human still sends it themselves) and "discard".
create table execution_drafts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  category text not null check (
    category in ('rsvp', 'reschedule', 'confirmation', 'gift_order')
  ),
  -- Nullable: a gift_order confirmation draft may address a vendor with
  -- no corresponding people row, not a specific household contact.
  contact_person_id uuid references people (id) on delete set null,
  -- 'manual' (a household member filled out the draft form themselves),
  -- 'templated' (proposeExecutionDraft's deterministic per-category
  -- template, no outbound AI text-generation call in v1), or
  -- 'inbound_email' -- reserved for when assistant_email_config's address
  -- is actually wired to a real inbound channel (see that table's
  -- comment and QUEUE-021); no code path produces 'inbound_email' rows
  -- yet, so this value never appears in v1 data.
  source_type text not null default 'manual' check (
    source_type in ('manual', 'templated', 'inbound_email')
  ),
  source_reference text,
  draft_subject text,
  draft_body text not null,
  status text not null default 'pending_review' check (
    status in ('pending_review', 'approved', 'discarded')
  ),
  reviewed_by_person_id uuid references people (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint execution_drafts_reviewed_pair check (
    (status = 'pending_review' and reviewed_by_person_id is null and reviewed_at is null)
    or (status in ('approved', 'discarded') and reviewed_by_person_id is not null and reviewed_at is not null)
  )
);

create trigger execution_drafts_set_updated_at
  before update on execution_drafts
  for each row execute function set_updated_at();

create index execution_drafts_household_status_idx
  on execution_drafts (household_id, status, created_at desc);

alter table execution_drafts enable row level security;

-- Same "any household member" shape as intake_drafts: proposing and
-- reviewing a draft is a shared household inbox activity, not an
-- admin-only surface.
create policy "household members read execution drafts"
  on execution_drafts for select
  using (is_household_member(household_id));

create policy "household members create execution drafts"
  on execution_drafts for insert
  with check (is_household_member(household_id));

create policy "household members update execution drafts"
  on execution_drafts for update
  using (is_household_member(household_id));

create policy "household members delete execution drafts"
  on execution_drafts for delete
  using (is_household_member(household_id));

-- assistant_email_config -----------------------------------------------------
-- The household's assistant address configuration. This codebase already
-- has an on-record blocker (the Resend verified-sending-domain decision)
-- that no outbound mail reaches anyone but the account owner yet;
-- receiving mail for a CC/forward address requires the same domain-level
-- DNS work as sending it. This table stores the address alias so the UI
-- can show it and so the schema is ready the moment that domain work
-- lands -- it deliberately does not imply live inbound wiring exists
-- (see QUEUE-021). alias is generated once per household and never
-- changes, so any future inbound wiring can route on it without a
-- migration.
create table assistant_email_config (
  household_id uuid primary key references households (id) on delete cascade,
  alias text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger assistant_email_config_set_updated_at
  before update on assistant_email_config
  for each row execute function set_updated_at();

alter table assistant_email_config enable row level security;

create policy "household members read assistant email config"
  on assistant_email_config for select
  using (is_household_member(household_id));

create policy "owner/adult manage assistant email config"
  on assistant_email_config for all
  using (household_role(household_id) in ('owner', 'adult'))
  with check (household_role(household_id) in ('owner', 'adult'));
