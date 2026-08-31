-- P3-6: calendar import (Google Calendar / iCal) so the weekend planner and
-- opportunity scanner know real free/busy time. Google Calendar (and every
-- other calendar app) exposes a "secret address in iCal format" -- a plain
-- HTTPS .ics URL, no OAuth app registration required -- so this is a real,
-- fully-working import rather than a stub: fetch the URL, parse VEVENTs
-- (including recurring ones), and materialize them as ordinary
-- calendar_events rows. Because lib/planner/generate.ts and
-- lib/opportunities/detect.ts both build their busy-period list from
-- calendar_events via listEventsInRange with no filtering on how a row got
-- there, imported events flow into both surfaces automatically -- this
-- migration and the sync code are the only things P3-6 needs; no changes
-- to the planner or opportunity scanner themselves.

-- A distinct event_type so the calendar UI can label an imported row
-- differently from one a person typed in themselves, without disturbing
-- any of the seven existing values or the manual create/edit form's own
-- EVENT_TYPES list (app/(app)/calendar/event-form.tsx), which enumerates
-- its own options rather than reading the full enum -- adding a value here
-- does not add it to that dropdown.
alter type calendar_event_type add value 'external';

create table calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  created_by_person_id uuid not null references people (id) on delete cascade,
  label text not null,
  feed_url text not null,
  last_synced_at timestamptz,
  last_sync_status text not null default 'never' check (last_sync_status in ('never', 'ok', 'error')),
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger calendar_feeds_set_updated_at
  before update on calendar_feeds
  for each row execute function set_updated_at();

create index calendar_feeds_household_idx on calendar_feeds (household_id);

alter table calendar_feeds enable row level security;

-- Same shape as calendar_events' own policies (Section 6 / RLS is the
-- household trust boundary): every household member can see which feeds
-- are connected, but only an owner or adult can add, resync, or remove
-- one -- a feed URL is effectively a credential (anyone with it can read
-- that person's calendar), so mutating it gets the same role gate as
-- creating events, not the wider "any member" gate.
create policy "household members read calendar feeds"
  on calendar_feeds for select
  using (is_household_member(household_id));

create policy "owner/adult create calendar feeds"
  on calendar_feeds for insert
  with check (is_household_member(household_id) and household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult update calendar feeds"
  on calendar_feeds for update
  using (household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult delete calendar feeds"
  on calendar_feeds for delete
  using (household_role(household_id) in ('owner', 'adult'));
