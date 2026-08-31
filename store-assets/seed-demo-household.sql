-- Fictional demo household for App Store / Play Store screenshot capture
-- only. Deliberately distinct from Richard's real "Smith Household" and
-- from the richard@example.com dev fixture in supabase/seed.sql (which also
-- happens to reuse the "Smith"/"Richard" persona names) — this uses a
-- different surname and clearly-fictional people so public screenshots
-- never resemble Richard's real family. Idempotent: fixed ids + on conflict.

begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
values (
  'd0000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'lifeos-demo-screenshots@example.com',
  crypt('Demo-Screenshots-Only-2026!', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"Alex Rivera"}',
  '', '', '', '', '', '', '', ''
)
on conflict (id) do nothing;

insert into users (id, display_name, home_address, home_lat, home_lng, timezone)
values (
  'd0000000-0000-0000-0000-000000000001',
  'Alex Rivera',
  '500 Demo Ave, Portland, OR',
  45.5152,
  -122.6784,
  'America/Los_Angeles'
)
on conflict (id) do update set
  display_name = excluded.display_name,
  home_address = excluded.home_address,
  home_lat = excluded.home_lat,
  home_lng = excluded.home_lng;

insert into households (id, name, default_gift_budget_min_cents, default_gift_budget_max_cents)
values ('d0000000-0000-0000-0000-000000000002', 'The Rivera Household', 3000, 7500)
on conflict (id) do nothing;

insert into household_members (household_id, user_id, role)
values ('d0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'owner')
on conflict (household_id, user_id) do nothing;

insert into people (id, household_id, user_id, full_name, nickname, relationship_type, birthdate, birth_year_known, notes)
values
  ('d0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'Alex Rivera', null, 'self', '1988-05-10', true, ''),
  ('d0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000002', null, 'Jamie Rivera', null, 'co_parent', '1989-02-18', true, 'Maya and Leo''s other parent. Alternating-weekend custody.'),
  ('d0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000002', null, 'Maya Rivera', null, 'child', '2017-09-02', true, 'Age 8.'),
  ('d0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000002', null, 'Leo Rivera', null, 'child', '2020-06-14', true, 'Age 6.'),
  ('d0000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000002', null, 'Sofia Rivera', 'Grandma Sofia', 'extended_family', '1958-11-30', true, ''),
  ('d0000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000002', null, 'Chris Bennett', null, 'friend', '1987-07-22', true, 'Hiking buddy.')
on conflict (id) do nothing;

insert into user_activities (id, household_id, person_id, activity_type, enjoyment_rank, typical_duration_minutes, requires_prep, prep_lead_time_hours, preferred_companions, is_active)
values
  ('d0000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003', 'hiking', 8, 150, true, 4, array['d0000000-0000-0000-0000-000000000008'::uuid], true),
  ('d0000000-0000-0000-0000-000000000011', 'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003', 'board_games', 7, 90, false, null, '{}', true)
on conflict (id) do nothing;

insert into activity_locations (id, user_activity_id, name, address, lat, lng, drive_time_minutes, notes, external_ids)
values
  ('d0000000-0000-0000-0000-000000000020', 'd0000000-0000-0000-0000-000000000010', 'Forest Park Trailhead', 'NW 29th Ave, Portland, OR', 45.5372, -122.7168, 12, 'Popular on weekends — go early.', '{}')
on conflict (id) do nothing;

insert into calendar_events (id, household_id, created_by_person_id, title, description, starts_at, ends_at, all_day, location, event_type, visibility)
values
  ('d0000000-0000-0000-0000-000000000030', 'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003', 'Maya soccer practice', null, (current_date + 1) + time '16:00', (current_date + 1) + time '17:30', false, 'Riverside Park', 'kid_activity', 'household'),
  ('d0000000-0000-0000-0000-000000000031', 'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003', 'Leo dentist appointment', null, (current_date + 3) + time '10:00', (current_date + 3) + time '11:00', false, 'Portland Family Dental', 'kid_activity', 'household'),
  ('d0000000-0000-0000-0000-000000000032', 'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003', 'Hike with Chris', 'Forest Park loop', (current_date + 5) + time '08:00', (current_date + 5) + time '10:30', false, 'Forest Park Trailhead', 'personal', 'household'),
  ('d0000000-0000-0000-0000-000000000033', 'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003', 'Family dinner at Grandma Sofia''s', null, (current_date + 6) + time '18:00', (current_date + 6) + time '20:00', false, null, 'family', 'household'),
  ('d0000000-0000-0000-0000-000000000034', 'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003', 'Family game night', 'Board games after dinner', (current_date + 8) + time '19:00', (current_date + 8) + time '20:30', false, null, 'family', 'household'),
  ('d0000000-0000-0000-0000-000000000035', 'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003', 'Kids handoff to Jamie', 'Start of Jamie''s custody weekend', (current_date + 9) + time '17:00', (current_date + 9) + time '17:30', false, null, 'custody', 'shared_with_coparent'),
  ('d0000000-0000-0000-0000-000000000036', 'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003', 'Book club', null, (current_date + 12) + time '19:00', (current_date + 12) + time '20:30', false, null, 'personal', 'private')
on conflict (id) do nothing;

insert into event_attendees (calendar_event_id, person_id, attendance_status)
values
  ('d0000000-0000-0000-0000-000000000030', 'd0000000-0000-0000-0000-000000000005', 'required'),
  ('d0000000-0000-0000-0000-000000000031', 'd0000000-0000-0000-0000-000000000006', 'required'),
  ('d0000000-0000-0000-0000-000000000032', 'd0000000-0000-0000-0000-000000000008', 'required')
on conflict (calendar_event_id, person_id) do nothing;

-- Custody blocks: two alternating weekends, Maya + Leo.
insert into custody_blocks (household_id, child_person_id, responsible_person_id, starts_at, ends_at, block_type, notes)
values
  ('d0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000004', (current_date + 4) + time '17:00', (current_date + 6) + time '17:00', 'regular', 'Alternating weekend custody'),
  ('d0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000004', (current_date + 4) + time '17:00', (current_date + 6) + time '17:00', 'regular', 'Alternating weekend custody'),
  ('d0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000003', (current_date + 11) + time '17:00', (current_date + 13) + time '17:00', 'regular', 'Alternating weekend custody'),
  ('d0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000003', (current_date + 11) + time '17:00', (current_date + 13) + time '17:00', 'regular', 'Alternating weekend custody')
on conflict do nothing;

insert into gift_suggestions (id, person_id, occasion_type, occasion_date, title, reasoning, price_tier, estimated_cost_cents, order_by_date, status, model_version)
values
  ('d0000000-0000-0000-0000-000000000040', 'd0000000-0000-0000-0000-000000000005', 'birthday', (date_trunc('year', current_date) + interval '8 months 19 days')::date, 'Kids'' art supply set', 'Maya has been asking to draw more.', 'low', 2500, (current_date + 10), 'suggested', 'demo-fixture'),
  ('d0000000-0000-0000-0000-000000000041', 'd0000000-0000-0000-0000-000000000005', 'birthday', (date_trunc('year', current_date) + interval '8 months 19 days')::date, 'Beginner bike helmet', 'She just started riding without training wheels.', 'mid', 4500, (current_date + 10), 'saved', 'demo-fixture')
on conflict (id) do nothing;

insert into gifts (id, person_id, given_by_person_id, occasion_type, occasion_date, description, category, cost_cents, status, reaction)
values
  ('d0000000-0000-0000-0000-000000000050', 'd0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000003', 'birthday', (current_date - interval '200 days')::date, 'Wooden train set', 'toys', 3000, 'given', 'loved_it')
on conflict (id) do nothing;

commit;
