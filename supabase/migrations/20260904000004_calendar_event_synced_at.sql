-- D-166 / QUEUE-017: CalDAV two-way sync last-write-wins re-push.
--
-- Additive, nullable column. synced_at records the last time this event was
-- successfully pushed to its two-way sync account (synced_to_account_id),
-- distinct from updated_at -- the push's own bookkeeping write (recording
-- synced_to_account_id / external_caldav_href / external_caldav_etag) also
-- advances updated_at, so updated_at alone can never distinguish "the user
-- edited this event" from "we just finished pushing it". Comparing
-- updated_at > synced_at is how lib/db/repositories/calendar.ts's
-- listEditedSyncedEventsForAccount() finds already-synced events that need
-- a re-push after a local edit.
--
-- Null for every event that has never been pushed (including all existing
-- rows as of this migration). No backfill needed: a null synced_at on an
-- already-synced row is treated by the application as "due for a push" the
-- next sync cycle, which is the correct behavior for the very first cycle
-- after this migration lands.

alter table public.calendar_events
  add column if not exists synced_at timestamptz;

comment on column public.calendar_events.synced_at is
  'D-166/QUEUE-017: last successful push time to a two-way CalDAV sync account. Distinct from updated_at (which the push write itself also advances). Null = never pushed, or due for re-push.';
