-- LifeOS demo seed data (Section 12.6).
-- One household, 12 people across relationship types (incl. 2 children),
-- interests, ~2 years of gift history with reactions, 4 activities with
-- locations, a month of calendar events, alternating-weekend custody.
--
-- Idempotent: every insert has a fixed id and an `on conflict do nothing`,
-- so re-running this file against a database that already has the seed is a
-- no-op rather than an error. Runs as the seeding role, which bypasses RLS.
--
-- Dates for birthdates and cadences are computed relative to current_date
-- rather than hardcoded, so re-seeding on any day still demonstrates an
-- "upcoming birthday within 60 days" and an "overdue contact" scenario —
-- see DECISIONS.md D-012.

begin;

-- ---------------------------------------------------------------------
-- Auth user + household + membership
-- ---------------------------------------------------------------------

-- The token columns (confirmation_token, recovery_token, etc.) must be ''
-- rather than the column default of NULL — GoTrue's Go client scans them as
-- strings and errors with a generic "Database error querying schema" on
-- login if any of them are NULL. See DECISIONS.md D-028.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
values (
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'richard@example.com',
  crypt('lifeos-dev-password', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"Richard Smith"}',
  '', '', '', '', '', '', '', ''
)
on conflict (id) do nothing;

-- public.users row is normally created by the handle_new_auth_user trigger;
-- upsert here too so this file is safe to run standalone against a DB where
-- the trigger fired already.
insert into users (id, display_name, home_address, home_lat, home_lng, timezone)
values (
  '10000000-0000-0000-0000-000000000001',
  'Richard Smith',
  '123 Main St, Eugene, OR',
  44.0521,
  -123.0868,
  'America/Los_Angeles'
)
on conflict (id) do update set
  display_name = excluded.display_name,
  home_address = excluded.home_address,
  home_lat = excluded.home_lat,
  home_lng = excluded.home_lng;

insert into households (id, name, default_gift_budget_min_cents, default_gift_budget_max_cents)
values ('20000000-0000-0000-0000-000000000001', 'Smith Household', 3000, 7500)
on conflict (id) do nothing;

insert into household_members (household_id, user_id, role)
values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner')
on conflict (household_id, user_id) do nothing;

-- ---------------------------------------------------------------------
-- People (12 total, including Richard; 2 children)
-- ---------------------------------------------------------------------

insert into people (id, household_id, user_id, full_name, nickname, relationship_type, birthdate, birth_year_known, notes)
values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Richard Smith', null, 'self', '1985-03-14', true, ''),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', null, 'Jennifer Smith', 'Jen', 'co_parent', '1986-11-02', true, 'Emma and Jack''s mother. Alternating-weekend custody.'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', null, 'Emma Smith', null, 'child', make_date(2016, extract(month from current_date + 35)::int, extract(day from current_date + 35)::int), true, 'Age 10.'),
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', null, 'Jack Smith', null, 'child', make_date(2019, extract(month from current_date + 100)::int, extract(day from current_date + 100)::int), true, 'Age 7.'),
  ('30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', null, 'Dave Wilson', null, 'friend', make_date(1984, extract(month from current_date + 18)::int, extract(day from current_date + 18)::int), true, 'Fly fishing buddy.'),
  ('30000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000001', null, 'Mike Johnson', null, 'friend', make_date(1983, extract(month from current_date + 200)::int, extract(day from current_date + 200)::int), true, 'Regular golf partner.'),
  ('30000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000001', null, 'Tom Smith', 'Dad', 'parent', '1958-06-20', true, ''),
  ('30000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000001', null, 'Carol Smith', 'Mom', 'parent', '1960-09-09', true, 'Gardener.'),
  ('30000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000001', null, 'Steve Smith', null, 'sibling', '1988-01-25', true, ''),
  ('3000000a-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', null, 'Amanda Reyes', null, 'colleague', null, false, 'Works with Richard.'),
  ('3000000b-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', null, 'Betty Smith', 'Grandma Betty', 'extended_family', '1950-04-11', true, ''),
  ('3000000c-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', null, 'Frank Smith', 'Uncle Frank', 'extended_family', '1962-07-30', true, 'Occasional fishing trips.'),
  -- D-148: nickname carrying its own distinct first name ("Cal" is not a
  -- substring/derivation of "Callan" the way most nicknames are of their
  -- full first name), seeded specifically so the Playwright E2E nickname-
  -- resolution spec (lib/ai/context.ts redactMentions/labelFor) has a real
  -- case to exercise instead of trivially matching on first name alone.
  ('3000000d-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', null, 'Callan Smith', 'Cal', 'child', make_date(2018, extract(month from current_date + 60)::int, extract(day from current_date + 60)::int), true, 'Age 8.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Interests
-- ---------------------------------------------------------------------

insert into person_interests (person_id, interest, category, strength, source, noted_at)
values
  ('30000000-0000-0000-0000-000000000005', 'fly fishing', 'outdoor', 'passionate', 'manual', current_date - 400),
  ('30000000-0000-0000-0000-000000000005', 'hiking', 'outdoor', 'casual', 'manual', current_date - 300),
  ('30000000-0000-0000-0000-000000000006', 'golf', 'sports', 'passionate', 'manual', current_date - 500),
  ('30000000-0000-0000-0000-000000000003', 'reading', 'indoor', 'regular', 'manual', current_date - 200),
  ('30000000-0000-0000-0000-000000000003', 'soccer', 'sports', 'regular', 'manual', current_date - 150),
  ('30000000-0000-0000-0000-000000000004', 'legos', 'toys', 'passionate', 'manual', current_date - 180),
  ('30000000-0000-0000-0000-000000000004', 'dinosaurs', 'toys', 'regular', 'manual', current_date - 90),
  ('30000000-0000-0000-0000-000000000002', 'yoga', 'wellness', 'casual', 'manual', current_date - 250),
  ('30000000-0000-0000-0000-000000000007', 'golf', 'sports', 'regular', 'manual', current_date - 600),
  ('30000000-0000-0000-0000-000000000008', 'gardening', 'outdoor', 'passionate', 'manual', current_date - 700),
  ('30000000-0000-0000-0000-000000000009', 'craft beer', 'food_drink', 'regular', 'manual', current_date - 120),
  ('3000000a-0000-0000-0000-000000000001', 'coffee', 'food_drink', 'casual', 'manual', current_date - 60),
  ('3000000b-0000-0000-0000-000000000001', 'knitting', 'crafts', 'passionate', 'manual', current_date - 800),
  ('3000000c-0000-0000-0000-000000000001', 'fishing', 'outdoor', 'casual', 'manual', current_date - 220)
on conflict (person_id, interest) do nothing;

-- ---------------------------------------------------------------------
-- Gift budgets
-- ---------------------------------------------------------------------

insert into person_gift_budgets (person_id, occasion_type, min_cents, max_cents)
values
  ('30000000-0000-0000-0000-000000000003', 'default', 3000, 7000),
  ('30000000-0000-0000-0000-000000000004', 'default', 3000, 7000),
  ('30000000-0000-0000-0000-000000000005', 'default', 4000, 9000),
  ('30000000-0000-0000-0000-000000000006', 'default', 4000, 9000),
  ('30000000-0000-0000-0000-000000000003', 'christmas', 2000, 5000),
  ('30000000-0000-0000-0000-000000000004', 'christmas', 2000, 5000)
on conflict (person_id, occasion_type) do nothing;

-- ---------------------------------------------------------------------
-- Gift history — roughly 2 years, with reactions (feeds the AI feedback
-- loop described in Section 7.7).
-- ---------------------------------------------------------------------

insert into gifts (id, person_id, given_by_person_id, occasion_type, occasion_date, description, category, cost_cents, status, reaction)
values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000001', 'birthday', (current_date - interval '1 year' - interval '18 days')::date, 'Orvis fly rod combo', 'handmade', 8500, 'given', 'loved_it'),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000001', 'birthday', (current_date - interval '18 days')::date, 'Fly tying kit', 'standard', 4500, 'given', 'liked_it'),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000001', 'birthday', (current_date - interval '1 year' - interval '200 days')::date, 'Golf glove set', 'standard', 3500, 'given', 'liked_it'),
  ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000001', 'birthday', (current_date - interval '200 days')::date, 'Titleist Pro V1 dozen', 'standard', 5000, 'given', 'loved_it'),
  ('40000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'christmas', (current_date - interval '1 year' - interval '35 days')::date, 'Chapter book bundle', 'standard', 3000, 'given', 'loved_it'),
  ('40000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'birthday', (current_date - interval '1 year' - interval '35 days')::date, 'Soccer cleats', 'apparel', 4000, 'given', 'liked_it'),
  ('40000000-0000-0000-0000-000000000007', '30000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'christmas', (current_date - interval '35 days')::date, 'Reading nook lamp', 'standard', 2500, 'given', 'liked_it'),
  ('40000000-0000-0000-0000-000000000008', '30000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', 'christmas', (current_date - interval '1 year' - interval '100 days')::date, 'Lego Creator set', 'standard', 5500, 'given', 'loved_it'),
  ('40000000-0000-0000-0000-000000000009', '30000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', 'birthday', (current_date - interval '1 year' - interval '100 days')::date, 'Dinosaur excavation kit', 'standard', 3000, 'given', 'loved_it'),
  ('4000000a-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', 'christmas', (current_date - interval '100 days')::date, 'Lego Technic set', 'standard', 6500, 'given', null),
  ('4000000b-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000007', '30000000-0000-0000-0000-000000000001', 'christmas', (current_date - interval '1 year' - interval '60 days')::date, 'Whiskey tasting set', 'standard', 6000, 'given', 'loved_it'),
  ('4000000c-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000008', '30000000-0000-0000-0000-000000000001', 'christmas', (current_date - interval '1 year' - interval '60 days')::date, 'Garden tool set', 'standard', 4500, 'given', 'liked_it')
on conflict (id) do nothing;

-- A previously-dismissed suggestion, so the AI suggestion generator has a
-- real "don't repeat this" example to exercise (Section 7.3).
insert into gift_suggestions (id, person_id, occasion_type, occasion_date, title, reasoning, price_tier, estimated_cost_cents, order_by_date, status, model_version)
values (
  '50000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000005',
  'birthday',
  (current_date + interval '18 days')::date,
  'Generic fishing hat',
  'Dave likes the outdoors.',
  'low',
  2000,
  (current_date + interval '11 days')::date,
  'dismissed',
  'seed-fixture'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Contact cadences — Mike is overdue, Dave is not (demonstrates the
-- "haven't golfed with Mike since April" brief scenario from Section 2.3).
-- ---------------------------------------------------------------------

insert into contact_cadences (person_id, target_interval_days, last_contact_date, last_contact_type, is_active)
values
  ('30000000-0000-0000-0000-000000000005', 30, (current_date - 12), 'activity', true),
  ('30000000-0000-0000-0000-000000000006', 14, (current_date - 45), 'activity', true),
  ('30000000-0000-0000-0000-000000000009', 60, (current_date - 20), 'call', true),
  ('3000000a-0000-0000-0000-000000000001', 90, (current_date - 30), 'in_person', true)
on conflict (person_id) do nothing;

insert into interactions (person_id, interaction_type, occurred_on, notes)
values
  ('30000000-0000-0000-0000-000000000005', 'activity', (current_date - 12), 'Fly fishing at Dexter Reservoir'),
  ('30000000-0000-0000-0000-000000000006', 'activity', (current_date - 45), 'Round at Emerald Valley'),
  ('30000000-0000-0000-0000-000000000009', 'call', (current_date - 20), 'Caught up by phone')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Activities + locations (4 activities)
-- ---------------------------------------------------------------------

insert into user_activities (id, household_id, person_id, activity_type, enjoyment_rank, typical_duration_minutes, requires_prep, prep_lead_time_hours, preferred_companions, is_active)
values
  ('60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'golf', 8, 240, false, null, array['30000000-0000-0000-0000-000000000006'::uuid, '30000000-0000-0000-0000-000000000007'::uuid], true),
  ('60000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'fishing', 9, 300, true, 12, array['30000000-0000-0000-0000-000000000005'::uuid], true),
  ('60000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'hiking', 7, 150, true, 4, array['30000000-0000-0000-0000-000000000005'::uuid], true),
  ('60000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'gym', 6, 75, false, null, '{}', true)
on conflict (id) do nothing;

insert into activity_locations (id, user_activity_id, name, address, lat, lng, drive_time_minutes, notes, external_ids)
values
  ('70000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'Emerald Valley Golf Club', '900 Crest Dr, Creswell, OR', 43.9165, -123.0234, 25, 'Back nine is slow after 2pm.', '{}'),
  ('70000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000002', 'Dexter Reservoir', 'Dexter, OR', 43.8965, -122.8195, 35, 'Boat ramp on the north side.', '{"usgs_gauge": "14150000"}'),
  ('70000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000003', 'Spencer Butte Trailhead', 'Willamette St, Eugene, OR', 43.9682, -123.0783, 15, 'Fills up early on weekends.', '{}'),
  ('70000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000004', 'Anytime Fitness', '1500 Main St, Eugene, OR', 44.0500, -123.0850, 8, '', '{}')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Calendar events — spread across the coming month.
-- ---------------------------------------------------------------------

insert into calendar_events (id, household_id, created_by_person_id, title, description, starts_at, ends_at, all_day, location, event_type, visibility)
values
  ('80000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Golf with Mike', 'Back nine after work', (current_date + 2) + time '08:00', (current_date + 2) + time '12:00', false, 'Emerald Valley Golf Club', 'personal', 'household'),
  ('80000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Team standup', null, (current_date + 1) + time '09:00', (current_date + 1) + time '09:30', false, null, 'work', 'private'),
  ('80000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Emma soccer practice', null, (current_date + 3) + time '16:00', (current_date + 3) + time '17:30', false, 'Amazon Park', 'kid_activity', 'household'),
  ('80000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Jack dentist appointment', null, (current_date + 5) + time '10:00', (current_date + 5) + time '11:00', false, 'Eugene Family Dental', 'kid_activity', 'household'),
  ('80000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Fly fishing with Dave', 'Dexter Reservoir', (current_date + 6) + time '06:30', (current_date + 6) + time '11:30', false, 'Dexter Reservoir', 'personal', 'household'),
  ('80000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Family dinner at Grandma Betty''s', null, (current_date + 9) + time '18:00', (current_date + 9) + time '20:00', false, null, 'family', 'household'),
  ('80000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Quarterly review', null, (current_date + 11) + time '13:00', (current_date + 11) + time '14:00', false, null, 'work', 'private'),
  ('80000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Kids handoff to Jennifer', 'Start of Jennifer''s custody weekend', (current_date + 12) + time '17:00', (current_date + 12) + time '17:30', false, null, 'custody', 'shared_with_coparent'),
  ('80000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Hike with Dave', 'Spencer Butte', (current_date + 16) + time '08:00', (current_date + 16) + time '10:30', false, 'Spencer Butte Trailhead', 'personal', 'household'),
  ('8000000a-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Steve''s birthday dinner', null, (current_date + 19) + time '19:00', (current_date + 19) + time '21:00', false, null, 'family', 'household'),
  ('8000000b-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Gym', null, (current_date + 1) + time '06:00', (current_date + 1) + time '07:15', false, 'Anytime Fitness', 'personal', 'private'),
  ('8000000c-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Gym', null, (current_date + 4) + time '06:00', (current_date + 4) + time '07:15', false, 'Anytime Fitness', 'personal', 'private'),
  ('8000000d-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Golf with Dad', null, (current_date + 23) + time '08:00', (current_date + 23) + time '12:00', false, 'Emerald Valley Golf Club', 'personal', 'household'),
  ('8000000e-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Coffee with Amanda', 'Project sync', (current_date + 7) + time '15:00', (current_date + 7) + time '15:45', false, null, 'work', 'private'),
  ('8000000f-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Emma soccer game', null, (current_date + 10) + time '10:00', (current_date + 10) + time '11:30', false, 'Amazon Park', 'kid_activity', 'household')
on conflict (id) do nothing;

insert into event_attendees (calendar_event_id, person_id, attendance_status)
values
  ('80000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000006', 'required'),
  ('80000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', 'required'),
  ('80000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000004', 'required'),
  ('80000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000005', 'required'),
  ('8000000f-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'required')
on conflict (calendar_event_id, person_id) do nothing;

-- ---------------------------------------------------------------------
-- Custody blocks — alternating weekends for Emma and Jack, ~8 weeks out.
-- Even-numbered weekends from today go to Jennifer, odd to Richard, so the
-- pattern is deterministic regardless of when the seed is loaded.
-- ---------------------------------------------------------------------

with weekends as (
  select
    gs::date as sat,
    row_number() over (order by gs) as weekend_num
  from generate_series(
    current_date + (((6 - extract(dow from current_date)::int) + 7) % 7) * interval '1 day',
    current_date + interval '70 days',
    interval '7 days'
  ) as gs
),
responsible as (
  select
    sat,
    weekend_num,
    case when weekend_num % 2 = 0
      then '30000000-0000-0000-0000-000000000002'::uuid  -- Jennifer
      else '30000000-0000-0000-0000-000000000001'::uuid  -- Richard
    end as responsible_person_id
  from weekends
)
insert into custody_blocks (household_id, child_person_id, responsible_person_id, starts_at, ends_at, block_type, notes)
select
  '20000000-0000-0000-0000-000000000001',
  child_id,
  responsible_person_id,
  sat + time '17:00',
  sat + interval '2 days' + time '17:00',
  'regular',
  'Alternating weekend custody'
from responsible
cross join (values
  ('30000000-0000-0000-0000-000000000003'::uuid),
  ('30000000-0000-0000-0000-000000000004'::uuid)
) as kids(child_id)
on conflict do nothing;

commit;
