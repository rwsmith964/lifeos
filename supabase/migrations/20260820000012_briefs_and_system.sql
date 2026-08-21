-- LifeOS: briefs, external_data_cache, ai_usage_log, device_tokens.

create table briefs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  for_person_id uuid not null references people (id) on delete cascade,
  brief_date date not null,
  content_json jsonb not null,
  content_markdown text not null,
  delivered_channels text[] not null default '{}',
  generated_at timestamptz not null default now(),
  opened_at timestamptz
);

create unique index briefs_person_date_unique on briefs (for_person_id, brief_date);
create index briefs_household_id_idx on briefs (household_id);

alter table briefs enable row level security;

create policy "household members read briefs"
  on briefs for select
  using (is_household_member(household_id));

create policy "owner/adult mark briefs opened"
  on briefs for update
  using (household_role(household_id) in ('owner', 'adult'));

-- Row creation is done by the brief-generation job using the service role
-- key, which bypasses RLS by design — no insert policy for regular users.

-- external_data_cache ------------------------------------------------------
-- Global, not household-scoped: weather/gauge/tide data carries no
-- per-household sensitivity, and re-fetching it per household would defeat
-- the point of the cache (Section 4.2). Written only by adapters running
-- with the service role; readable by any authenticated user.

create table external_data_cache (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  cache_key text not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create unique index external_data_cache_source_key_unique on external_data_cache (source, cache_key);
create index external_data_cache_expires_at_idx on external_data_cache (expires_at);

alter table external_data_cache enable row level security;

create policy "any authenticated user can read the shared cache"
  on external_data_cache for select
  using (auth.uid() is not null);

-- ai_usage_log --------------------------------------------------------
-- Cost control from day one (Section 11.3). Read-restricted to owner/adult
-- as cost/billing-adjacent data; written only by lib/ai/client.ts via the
-- service role.

create table ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  feature text not null,
  model text not null,
  input_tokens integer not null,
  output_tokens integer not null,
  estimated_cost_cents numeric not null,
  created_at timestamptz not null default now()
);

create index ai_usage_log_household_id_idx on ai_usage_log (household_id);
create index ai_usage_log_created_at_idx on ai_usage_log (created_at);

alter table ai_usage_log enable row level security;

create policy "owner/adult read ai usage log"
  on ai_usage_log for select
  using (household_role(household_id) in ('owner', 'adult'));

-- device_tokens --------------------------------------------------------
-- Push is v2 (Section 10.3), but the table exists now so the schema is
-- ready and the adapter interface has somewhere real to write to.

create table device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  platform text not null,
  token text not null,
  created_at timestamptz not null default now(),
  constraint device_tokens_platform_valid check (platform in ('ios', 'android', 'web'))
);

create unique index device_tokens_token_unique on device_tokens (token);
create index device_tokens_user_id_idx on device_tokens (user_id);

alter table device_tokens enable row level security;

create policy "users manage their own device tokens select"
  on device_tokens for select
  using (user_id = auth.uid());

create policy "users manage their own device tokens insert"
  on device_tokens for insert
  with check (user_id = auth.uid());

create policy "users manage their own device tokens delete"
  on device_tokens for delete
  using (user_id = auth.uid());
