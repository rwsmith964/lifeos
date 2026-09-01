-- Module 4 (scheduling_v2, D-120): Scheduling Intelligence.
-- Additive only, per the Additive Contract (brief Section 3): three new
-- tables, nothing altered on any existing table, column, default, or
-- constraint. Travel-time-aware conflict detection itself needs no new
-- table at all -- it is computed at read time from the existing
-- calendar_events columns (lib/scheduling/detect-conflicts.ts), the same
-- "computed, not materialized" philosophy custody/conflicts.ts already
-- uses (D-068) -- so this migration only covers the two pieces that
-- genuinely need persistence: preference memory and calendar sync accounts
-- (two-way CalDAV sync; see QUEUE-015 for why Google OAuth isn't wired yet).

-- household_scheduling_preferences ---------------------------------------
-- Structured preference memory (brief: "store as structured preferences,
-- not as free-text prompt stuffing"). One row per household -- every field
-- nullable/defaulted so a household can set only what it cares about.
-- Written and read exclusively through lib/scheduling/preferences.ts; the
-- brief generator and any future consumer read this table directly, never
-- through free-text prompt injection.

create table household_scheduling_preferences (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade unique,
  -- Quiet hours: no brief/notification should be framed as urgent inside
  -- this window. Plain local time-of-day, not a timestamp -- this repeats
  -- every day, and the household's timezone already lives on `households`.
  quiet_hours_start time,
  quiet_hours_end time,
  -- Who should be addressed/responded-to first when a brief item or
  -- conflict names multiple people -- an ordered list of person ids, most
  -- important first. Plain uuid[] rather than a join table: this is a
  -- single ordered preference per household, not a many-to-many relation
  -- with its own attributes.
  response_priority_person_ids uuid[] not null default '{}',
  -- How the daily brief should be framed for this household -- a closed
  -- set of tone options rather than a free-text prompt, per the brief's
  -- explicit "not free-text prompt stuffing" instruction.
  brief_framing text not null default 'balanced' check (
    brief_framing in ('concise', 'balanced', 'detailed', 'encouraging')
  ),
  -- Preferred windows for scheduling new leisure/activity time -- e.g.
  -- "weekday evenings after 5:30", "Saturday mornings". Structured as a
  -- small jsonb array of {dayOfWeek, startTime, endTime} rather than a new
  -- table, since this is read as one unit (a household's whole set of
  -- preferred windows) everywhere it's used and has no per-window
  -- attributes beyond the three fields -- a table would be one row per
  -- window with nothing else to query it by.
  preferred_activity_windows jsonb not null default '[]'::jsonb,
  -- Recurring-check-in cadence in days -- how often this household expects
  -- to review/confirm the upcoming schedule (distinct from
  -- contact_cadences, which tracks staying in touch with a *person*, not
  -- reviewing the calendar itself).
  schedule_review_cadence_days integer check (schedule_review_cadence_days is null or schedule_review_cadence_days > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger household_scheduling_preferences_set_updated_at
  before update on household_scheduling_preferences
  for each row execute function set_updated_at();

alter table household_scheduling_preferences enable row level security;

create policy "household members read scheduling preferences"
  on household_scheduling_preferences for select
  using (is_household_member(household_id));

create policy "owner/adult create scheduling preferences"
  on household_scheduling_preferences for insert
  with check (is_household_member(household_id) and household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult update scheduling preferences"
  on household_scheduling_preferences for update
  using (household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult delete scheduling preferences"
  on household_scheduling_preferences for delete
  using (household_role(household_id) in ('owner', 'adult'));

-- calendar_sync_accounts ---------------------------------------------------
-- Two-way calendar sync connections (brief: "Two-way sync with Google,
-- Apple, and Outlook -- match Ohai's coverage"). Deliberately a new table
-- rather than new columns on calendar_feeds: calendar_feeds is a one-way
-- ICS pull with no credential/auth concept at all (just a secret URL) and
-- is reused as-is (lib/calendar/ics-import.ts's parser is shared, not
-- rewritten) -- a sync *account* has a materially different shape
-- (auth method, push direction, per-event round-trip identity) that would
-- have meant nullable-column sprawl on an existing, already-shipped table.
--
-- provider: 'apple_icloud' and 'outlook_caldav' are wired end-to-end via
-- generic CalDAV (lib/calendar/caldav.ts) -- no OAuth app needed, just a
-- per-account app-specific password, the same "paste in your own
-- credential" shape calendar_feeds.feed_url already uses. 'google' is a
-- selectable-but-disabled option (see QUEUE-015): the row shape supports
-- it (oauth_* columns below) but lib/calendar/sync-providers.ts refuses to
-- activate it until GOOGLE_CALENDAR_CLIENT_ID/SECRET are configured --
-- interface ready, implementation deferred, same posture as the sms/push
-- notification channels.
create table calendar_sync_accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  created_by_person_id uuid not null references people (id) on delete cascade,
  provider text not null check (provider in ('apple_icloud', 'outlook_caldav', 'google')),
  label text not null,
  -- CalDAV auth (apple_icloud / outlook_caldav). caldav_app_password_* is
  -- AES-256-GCM ciphertext (lib/security/encryption.ts, QUEUE-016) -- never
  -- plaintext. All three nullable together since a 'google' row has none
  -- of them set.
  caldav_server_url text,
  caldav_username text,
  caldav_app_password_ciphertext text,
  caldav_app_password_iv text,
  caldav_app_password_auth_tag text,
  caldav_calendar_href text,
  -- OAuth (google, once QUEUE-015 is resolved). Same encrypted-at-rest
  -- treatment as the CalDAV password once real tokens exist; unused
  -- (always null) until then.
  oauth_access_token_ciphertext text,
  oauth_refresh_token_ciphertext text,
  oauth_token_expires_at timestamptz,
  -- 'two_way' pushes LifeOS-created events out; 'pull_only' just imports,
  -- same as calendar_feeds -- lets a household dial back to read-only
  -- without disconnecting the account.
  sync_direction text not null default 'two_way' check (sync_direction in ('pull_only', 'two_way')),
  last_pull_at timestamptz,
  last_pull_status text not null default 'never' check (last_pull_status in ('never', 'ok', 'error')),
  last_pull_error text,
  last_push_at timestamptz,
  last_push_status text not null default 'never' check (last_push_status in ('never', 'ok', 'error')),
  last_push_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger calendar_sync_accounts_set_updated_at
  before update on calendar_sync_accounts
  for each row execute function set_updated_at();

create index calendar_sync_accounts_household_idx on calendar_sync_accounts (household_id);

alter table calendar_sync_accounts enable row level security;

-- Same role gate as calendar_feeds: a sync account holds a real credential,
-- so mutating it (not just reading that it exists) is owner/adult-only.
create policy "household members read calendar sync accounts"
  on calendar_sync_accounts for select
  using (is_household_member(household_id));

create policy "owner/adult create calendar sync accounts"
  on calendar_sync_accounts for insert
  with check (is_household_member(household_id) and household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult update calendar sync accounts"
  on calendar_sync_accounts for update
  using (household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult delete calendar sync accounts"
  on calendar_sync_accounts for delete
  using (household_role(household_id) in ('owner', 'adult'));

-- Round-trip identity for two-way sync: which remote sync account (if any)
-- a LifeOS-originated event has been pushed to, and the CalDAV resource
-- href/etag needed to update or delete it there without re-creating a
-- duplicate. Nullable columns on the existing calendar_events table --
-- permitted under the Additive Contract ("new tables, not altered ones --
-- additions are new tables or new *nullable* columns"). No default change,
-- no existing row affected: every pre-existing event simply has these as
-- null, meaning "not synced," which is exactly today's behavior.
alter table calendar_events
  add column synced_to_account_id uuid references calendar_sync_accounts (id) on delete set null,
  add column external_caldav_href text,
  add column external_caldav_etag text;

create index calendar_events_synced_to_account_idx on calendar_events (synced_to_account_id) where synced_to_account_id is not null;
