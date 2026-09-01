-- Build Brief (Competitive Parity + Moat Extension), Additive Contract §3.2:
-- "Every module behind a feature flag, default OFF. With all flags off, the
-- app must behave identically to today." No flag mechanism existed in the
-- repo before this migration (confirmed in FEATURES.md's Phase 0 inventory)
-- -- this is the first piece of infrastructure every Module 1-8 flag sits
-- on top of.
--
-- Per-household rows rather than a single global switch, matching the
-- household-scoped-preference pattern already used for
-- households.notification_channels (20260830000005) and
-- households.gift_scan_horizon_days (20260820000002): a feature can be
-- turned on for one household to validate it without affecting every other
-- tenant, and RLS gives the same household-isolation guarantee every other
-- table gets. Absence of a row for a given (household_id, flag_key) means
-- "not enabled" -- callers use isFeatureEnabled()'s default-false fallback
-- rather than requiring a pre-seeded row per household per flag.
create table feature_flags (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  flag_key text not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, flag_key)
);

create trigger feature_flags_set_updated_at
  before update on feature_flags
  for each row execute function set_updated_at();

create index feature_flags_household_idx on feature_flags (household_id);

alter table feature_flags enable row level security;

-- Same role split as calendar_feeds: every household member can see which
-- modules are turned on (so e.g. a partner isn't confused by a feature that
-- silently doesn't exist for them), but only an owner or adult can flip one
-- -- flags gate real writes (gift pipeline, intake review queue, etc.), so
-- toggling one is a household-configuration action, not a everyday-member
-- action.
create policy "household members read feature flags"
  on feature_flags for select
  using (is_household_member(household_id));

create policy "owner/adult create feature flags"
  on feature_flags for insert
  with check (is_household_member(household_id) and household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult update feature flags"
  on feature_flags for update
  using (household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult delete feature flags"
  on feature_flags for delete
  using (household_role(household_id) in ('owner', 'adult'));
