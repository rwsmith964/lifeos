-- D-148: second, isolated household for the Playwright cross-household
-- isolation spec (e2e/household-isolation.spec.ts — the regression test
-- for D-053, a real production incident where an unfiltered service-role
-- query leaked one household's data into another's).
--
-- Applied ONLY in the E2E CI job, layered on top of supabase/seed.sql:
-- `supabase db reset` runs migrations then supabase/seed.sql, then a
-- separate `psql -f supabase/seed-e2e.sql` step applies this file on top
-- (the installed Supabase CLI has no `db reset --seed-file` flag — see
-- the `e2e` job in .github/workflows/verify.yml for the exact commands).
-- NEVER apply this to a real project (dev or production) — it exists solely
-- to give the isolation spec a second real household to sign in as and a
-- distinctive "canary" string that must never appear anywhere while signed
-- in as the Smith household (id 20000000-0000-0000-0000-000000000001) from
-- supabase/seed.sql.
--
-- Idempotent, same convention as seed.sql: fixed ids, `on conflict do
-- nothing`, safe to re-run.

begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
values (
  'e0000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'jones-e2e@example.com',
  crypt('lifeos-e2e-password', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"Jamie Jones"}',
  '', '', '', '', '', '', '', ''
)
on conflict (id) do nothing;

insert into users (id, display_name, home_address, home_lat, home_lng, timezone)
values (
  'e0000000-0000-0000-0000-000000000001',
  'Jamie Jones',
  '456 Oak Ave, Portland, OR',
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
values ('e1000000-0000-0000-0000-000000000001', 'Jones Household (E2E)', 3000, 7500)
on conflict (id) do nothing;

insert into household_members (household_id, user_id, role)
values ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'owner')
on conflict (household_id, user_id) do nothing;

-- Every canary value below embeds the same unique token, CANARY-JONES-9f21,
-- so the isolation spec can assert on one literal string across every
-- surface (calendar, people, gifts, brief) instead of maintaining a
-- per-surface expected value.
insert into people (id, household_id, user_id, full_name, nickname, relationship_type, birthdate, birth_year_known, notes)
values
  ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'Jamie Jones', null, 'self', '1987-05-02', true, 'CANARY-JONES-9f21 private note about Jamie.'),
  ('e2000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', null, 'Jordan Jones', 'Jordy', 'child', make_date(2017, extract(month from current_date + 45)::int, extract(day from current_date + 45)::int), true, 'CANARY-JONES-9f21 note about Jordan.')
on conflict (id) do nothing;

insert into calendar_events (id, household_id, created_by_person_id, title, description, starts_at, ends_at, all_day, location, event_type, visibility)
values
  ('e3000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001', 'CANARY-JONES-9f21 Family Event', 'Secret Jones household plan', (current_date + 3) + time '14:00', (current_date + 3) + time '15:00', false, 'CANARY-JONES-9f21 Location', 'family', 'household')
on conflict (id) do nothing;

insert into person_interests (person_id, interest, category, strength, source, noted_at)
values
  ('e2000000-0000-0000-0000-000000000002', 'canary-jones-9f21 collecting stickers', 'hobby', 'passionate', 'manual', now())
on conflict do nothing;

commit;
