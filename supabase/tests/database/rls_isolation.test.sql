-- RLS cross-household isolation test suite (Section 6.2 — "non-negotiable").
--
-- Run with the Supabase CLI once Docker is available locally:
--   supabase start
--   supabase test db
--
-- Uses pgTAP. Simulates two different authenticated users by setting the
-- `request.jwt.claims` GUC that Supabase's `auth.uid()` reads from
-- (`current_setting('request.jwt.claims', true)::json->>'sub'`), then
-- switching to the `authenticated` role so RLS actually applies (the
-- migration/seed steps below run as the unrestricted test-runner role).

begin;

create extension if not exists pgtap;

select plan(28);

-- ---------------------------------------------------------------------
-- Fixtures: two households ("A" and "B"), one owner user each, one person
-- and one calendar event of each visibility tier in each household, plus a
-- pending household_link between them (co-parent model, not yet active).
-- ---------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner-a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'owner-b@example.com');

insert into households (id, name) values
  ('a0000000-0000-0000-0000-000000000001', 'Household A'),
  ('b0000000-0000-0000-0000-000000000001', 'Household B');

insert into household_members (household_id, user_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'owner'),
  ('b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'owner');

insert into people (id, household_id, user_id, full_name, relationship_type) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Owner A', 'self'),
  ('a1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', null, 'Friend Of A', 'friend'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'Owner B', 'self');

insert into gifts (id, person_id, occasion_type, occasion_date, description, status) values
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'birthday', '2026-09-01', 'Fishing rod', 'idea');

insert into calendar_events (id, household_id, created_by_person_id, title, starts_at, ends_at, visibility) values
  ('a3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'A private event', now(), now() + interval '1 hour', 'private'),
  ('a3000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'A household event', now(), now() + interval '1 hour', 'household'),
  ('a3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'A shared-with-coparent event', now(), now() + interval '1 hour', 'shared_with_coparent');

insert into custody_blocks (id, household_id, child_person_id, responsible_person_id, starts_at, ends_at) values
  ('a4000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', now(), now() + interval '2 days');

insert into household_links (household_a_id, household_b_id, status) values
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'pending');

-- ---------------------------------------------------------------------
-- As user A: can read household A's own data, cannot read household B's.
-- ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select is((select count(*) from households)::int, 1, 'user A sees exactly 1 household (their own)');
select is((select id from households limit 1), 'a0000000-0000-0000-0000-000000000001'::uuid, 'user A sees household A, not B');

select is((select count(*) from people)::int, 2, 'user A sees only household A''s 2 people');
select is((select count(*) from people where household_id = 'b0000000-0000-0000-0000-000000000001'), 0::bigint, 'user A cannot see household B''s people via any query shape');

select is((select count(*) from gifts)::int, 1, 'user A sees household A''s gift row');

select is((select count(*) from custody_blocks)::int, 1, 'user A sees household A''s custody block');

-- Calendar visibility tiers, all within A's own household, all created by A:
-- creator can read all three regardless of tier.
select is((select count(*) from calendar_events)::int, 3, 'creator (user A) reads all 3 of their own events regardless of visibility tier');

-- Pending link should NOT grant cross-household visibility yet.
select is((select count(*) from household_links)::int, 1, 'user A can see the pending link touching their household');

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------
-- As user B: cannot read household A's data at all, including via the
-- pending (not yet active) household_link.
-- ---------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is((select count(*) from households)::int, 1, 'user B sees exactly 1 household (their own)');
select is((select id from households limit 1), 'b0000000-0000-0000-0000-000000000001'::uuid, 'user B sees household B, not A');

select is((select count(*) from people)::int, 1, 'user B sees only household B''s 1 person');
select is((select count(*) from people where household_id = 'a0000000-0000-0000-0000-000000000001'), 0::bigint, 'user B cannot see household A''s people');

select is((select count(*) from gifts)::int, 0, 'user B cannot see household A''s gift row (no gifts of their own)');

select is((select count(*) from custody_blocks)::int, 0, 'user B cannot see household A''s custody block');

-- Household B has no calendar events of its own; user B must see 0 of A's,
-- across all three visibility tiers, pending link notwithstanding.
select is((select count(*) from calendar_events)::int, 0, 'user B sees 0 of household A''s events (private tier blocked)');
select is((select count(*) from calendar_events where id = 'a3000000-0000-0000-0000-000000000002'), 0::bigint, 'user B specifically cannot read A''s "household"-tier event');
select is((select count(*) from calendar_events where id = 'a3000000-0000-0000-0000-000000000003'), 0::bigint, 'user B specifically cannot read A''s "shared_with_coparent" event while the link is only pending');

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------
-- Activate the household_link and re-check: shared_with_coparent should
-- now be visible to user B; household and private tiers must remain hidden.
-- ---------------------------------------------------------------------

update household_links set status = 'active'
where household_a_id = 'a0000000-0000-0000-0000-000000000001'
  and household_b_id = 'b0000000-0000-0000-0000-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is((select count(*) from calendar_events)::int, 1, 'once linked+active, user B sees exactly 1 of household A''s events');
select is((select count(*) from calendar_events where id = 'a3000000-0000-0000-0000-000000000003'), 1::bigint, 'the visible event is specifically the shared_with_coparent one');
select is((select count(*) from calendar_events where id = 'a3000000-0000-0000-0000-000000000001'), 0::bigint, 'the private event is still hidden even with an active link');
select is((select count(*) from calendar_events where id = 'a3000000-0000-0000-0000-000000000002'), 0::bigint, 'the household-only event is still hidden even with an active link');

-- Linking calendars does not leak unrelated tables: people/gifts/custody
-- must remain fully isolated regardless of the household_link.
select is((select count(*) from people where household_id = 'a0000000-0000-0000-0000-000000000001'), 0::bigint, 'active co-parent link does not leak household A''s people table to B');
select is((select count(*) from gifts)::int, 0, 'active co-parent link does not leak household A''s gifts to B (spoiler-safety, not just tenancy)');
select is((select count(*) from custody_blocks)::int, 0, 'active co-parent link does not leak household A''s custody_blocks to B');

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------
-- household_members bootstrap: a brand new user can self-join a household
-- with no members yet (onboarding), but cannot self-join an already-owned
-- household.
-- ---------------------------------------------------------------------

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000c', 'newuser-c@example.com');
insert into households (id, name) values ('c0000000-0000-0000-0000-000000000001', 'Household C (fresh, no members yet)');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';

select lives_ok(
  $$ insert into household_members (household_id, user_id, role) values ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'owner') $$,
  'a user can self-join an empty (just-created) household as its first member'
);

select throws_ok(
  $$ insert into household_members (household_id, user_id, role) values ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'adult') $$,
  '42501',
  null,
  'a user cannot self-join household A, which already has an owner (user A)'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------
-- gifts/gift_suggestions spoiler-safety (D-007): a 'child'-role member of
-- the SAME household as the gift recipient still cannot read the row.
-- ---------------------------------------------------------------------

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000d', 'kid-d@example.com');
insert into people (id, household_id, user_id, full_name, relationship_type) values
  ('a1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000d', 'Kid D', 'child');
insert into household_members (household_id, user_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000d', 'child');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}';

select is((select count(*) from people)::int, 3, 'a child-role member still sees the household''s people (general read stays open, D-009)');
select is((select count(*) from gifts)::int, 0, 'a child-role member of the SAME household cannot read gifts (spoiler-safety, D-007)');

reset role;
reset request.jwt.claims;

select * from finish();
rollback;
