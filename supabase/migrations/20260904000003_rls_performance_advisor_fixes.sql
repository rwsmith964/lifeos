-- D-164 (QUEUE-045): Supabase performance-advisor RLS fixes.
--
-- Two categories, both mechanically safe (no change to who can see or write
-- what -- verified by the expanded supabase/tests/pglite/rls.test.ts suite
-- before and after this migration):
--
-- 1. auth_rls_initplan (18 policies across 9 tables): replace direct
--    `auth.uid()` calls in policy USING/WITH CHECK expressions with
--    `(select auth.uid())`, which lets Postgres evaluate it once per
--    statement (via an InitPlan) instead of once per row.
--    https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- 2. multiple_permissive_policies (20 findings, 4 distinct policy pairs):
--    a. assistant_email_config, contact_execution_settings,
--       execution_categories: each has a `FOR ALL` "owner/adult manage"
--       policy that already covers SELECT, redundantly OR'd against a
--       separate "household members read" SELECT policy every row. Split
--       the ALL policy into INSERT/UPDATE/DELETE-only (Postgres does not
--       support restricting FOR ALL to a command subset in one CREATE
--       POLICY), so SELECT is decided by exactly one policy. Owner/adult
--       members keep read access because they are also household members.
--    b. household_members: two separate DELETE policies (self-leave vs.
--       owner-removes-another-member) are merged into one policy whose
--       USING clause is the OR of both original conditions.

-- ============================================================
-- 1. auth_rls_initplan: wrap auth.uid() in (select auth.uid())
-- ============================================================

-- users
drop policy if exists "read own profile or a household-mate's profile" on public.users;
create policy "read own profile or a household-mate's profile" on public.users
  for select using (
    id = (select auth.uid())
    or exists (
      select 1
      from household_members mine
      join household_members theirs on theirs.household_id = mine.household_id
      where mine.user_id = (select auth.uid())
        and theirs.user_id = users.id
    )
  );

drop policy if exists "users can insert their own profile row" on public.users;
create policy "users can insert their own profile row" on public.users
  for insert with check (id = (select auth.uid()));

drop policy if exists "users can update their own profile" on public.users;
create policy "users can update their own profile" on public.users
  for update using (id = (select auth.uid()));

-- household_members (initplan wrap only here; the two DELETE policies are
-- consolidated separately below)
drop policy if exists "self-join an empty household, or owner adds members" on public.household_members;
create policy "self-join an empty household, or owner adds members" on public.household_members
  for insert with check (
    user_id = (select auth.uid())
    and (household_member_count(household_id) = 0 or household_role(household_id) = 'owner'::household_role)
  );

-- external_data_cache
drop policy if exists "any authenticated user can read the shared cache" on public.external_data_cache;
create policy "any authenticated user can read the shared cache" on public.external_data_cache
  for select using ((select auth.uid()) is not null);

-- households
drop policy if exists "any authenticated user can create a household" on public.households;
create policy "any authenticated user can create a household" on public.households
  for insert with check ((select auth.uid()) is not null);

-- device_tokens
drop policy if exists "users manage their own device tokens delete" on public.device_tokens;
create policy "users manage their own device tokens delete" on public.device_tokens
  for delete using (user_id = (select auth.uid()));

drop policy if exists "users manage their own device tokens insert" on public.device_tokens;
create policy "users manage their own device tokens insert" on public.device_tokens
  for insert with check (user_id = (select auth.uid()));

drop policy if exists "users manage their own device tokens select" on public.device_tokens;
create policy "users manage their own device tokens select" on public.device_tokens
  for select using (user_id = (select auth.uid()));

-- gift_shipping_windows
drop policy if exists "any authenticated user can read shipping windows" on public.gift_shipping_windows;
create policy "any authenticated user can read shipping windows" on public.gift_shipping_windows
  for select using ((select auth.uid()) is not null);

-- notifications
drop policy if exists "recipient marks their own notifications read" on public.notifications;
create policy "recipient marks their own notifications read" on public.notifications
  for update using (
    exists (select 1 from people p where p.id = notifications.person_id and p.user_id = (select auth.uid()))
  );

drop policy if exists "recipient reads their own notifications" on public.notifications;
create policy "recipient reads their own notifications" on public.notifications
  for select using (
    exists (select 1 from people p where p.id = notifications.person_id and p.user_id = (select auth.uid()))
  );

-- household_invites
drop policy if exists "owner or adult can create invites" on public.household_invites;
create policy "owner or adult can create invites" on public.household_invites
  for insert with check (
    is_household_member(household_id)
    and household_role(household_id) = any (array['owner'::household_role, 'adult'::household_role])
    and invited_by_user_id = (select auth.uid())
  );

-- brain_dump_batches
drop policy if exists "creator or owner/adult delete brain dump batches" on public.brain_dump_batches;
create policy "creator or owner/adult delete brain dump batches" on public.brain_dump_batches
  for delete using (
    household_role(household_id) = any (array['owner'::household_role, 'adult'::household_role])
    or exists (
      select 1 from people p
      where p.id = brain_dump_batches.created_by_person_id and p.user_id = (select auth.uid())
    )
  );

drop policy if exists "creator or owner/adult update brain dump batches" on public.brain_dump_batches;
create policy "creator or owner/adult update brain dump batches" on public.brain_dump_batches
  for update using (
    household_role(household_id) = any (array['owner'::household_role, 'adult'::household_role])
    or exists (
      select 1 from people p
      where p.id = brain_dump_batches.created_by_person_id and p.user_id = (select auth.uid())
    )
  );

drop policy if exists "household members create own brain dump batches" on public.brain_dump_batches;
create policy "household members create own brain dump batches" on public.brain_dump_batches
  for insert with check (
    is_household_member(household_id)
    and exists (
      select 1 from people p
      where p.id = brain_dump_batches.created_by_person_id and p.user_id = (select auth.uid())
    )
  );

-- ============================================================
-- 2a. multiple_permissive_policies: split FOR ALL into INSERT/UPDATE/DELETE
--     so SELECT is governed by exactly one policy (the "read" policy).
-- ============================================================

-- assistant_email_config
drop policy if exists "owner/adult manage assistant email config" on public.assistant_email_config;
create policy "owner/adult insert assistant email config" on public.assistant_email_config
  for insert with check (household_role(household_id) = any (array['owner'::household_role, 'adult'::household_role]));
create policy "owner/adult update assistant email config" on public.assistant_email_config
  for update using (household_role(household_id) = any (array['owner'::household_role, 'adult'::household_role]))
  with check (household_role(household_id) = any (array['owner'::household_role, 'adult'::household_role]));
create policy "owner/adult delete assistant email config" on public.assistant_email_config
  for delete using (household_role(household_id) = any (array['owner'::household_role, 'adult'::household_role]));

-- contact_execution_settings
drop policy if exists "owner/adult manage contact execution settings" on public.contact_execution_settings;
create policy "owner/adult insert contact execution settings" on public.contact_execution_settings
  for insert with check (household_role(household_id) = any (array['owner'::household_role, 'adult'::household_role]));
create policy "owner/adult update contact execution settings" on public.contact_execution_settings
  for update using (household_role(household_id) = any (array['owner'::household_role, 'adult'::household_role]))
  with check (household_role(household_id) = any (array['owner'::household_role, 'adult'::household_role]));
create policy "owner/adult delete contact execution settings" on public.contact_execution_settings
  for delete using (household_role(household_id) = any (array['owner'::household_role, 'adult'::household_role]));

-- execution_categories
drop policy if exists "owner/adult manage execution categories" on public.execution_categories;
create policy "owner/adult insert execution categories" on public.execution_categories
  for insert with check (household_role(household_id) = any (array['owner'::household_role, 'adult'::household_role]));
create policy "owner/adult update execution categories" on public.execution_categories
  for update using (household_role(household_id) = any (array['owner'::household_role, 'adult'::household_role]))
  with check (household_role(household_id) = any (array['owner'::household_role, 'adult'::household_role]));
create policy "owner/adult delete execution categories" on public.execution_categories
  for delete using (household_role(household_id) = any (array['owner'::household_role, 'adult'::household_role]));

-- ============================================================
-- 2b. multiple_permissive_policies: merge household_members' two DELETE
--     policies (self-leave, owner-removes-another-member) into one.
-- ============================================================

drop policy if exists "non-owner members can leave a household" on public.household_members;
drop policy if exists "owners remove other members" on public.household_members;
create policy "leave household, or owner removes another member" on public.household_members
  for delete using (
    (user_id = (select auth.uid()) and role <> 'owner'::household_role)
    or (household_role(household_id) = 'owner'::household_role and user_id <> (select auth.uid()))
  );
