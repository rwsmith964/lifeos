-- LifeOS: fix a real RLS bug in household_members' INSERT policy, found by
-- actually executing the migrations + RLS suite against PGlite (D-026).
--
-- The original policy (20260820000005) gated self-join on:
--   not exists (select 1 from household_members existing where
--               existing.household_id = household_members.household_id)
-- That subquery is a plain SELECT against household_members, so it is
-- itself subject to household_members' own SELECT policy — which only
-- shows a user rows for households THEY already belong to. For a user who
-- is not yet a member of the target household, that subquery always
-- returns zero rows regardless of whether the household already has an
-- owner, so `not exists (...)` was always true for an outsider. Net
-- effect: ANY authenticated user could self-join ANY existing household
-- as long as they weren't already a member of it — the exact opposite of
-- what the policy was supposed to prevent. This is the same
-- self-referential-RLS trap D-011 already called out and solved with
-- SECURITY DEFINER helper functions elsewhere — this one policy was
-- missed because it queried household_members directly instead of going
-- through a helper.
--
-- Confirmed via a real end-to-end run (D-026): an outsider user could
-- insert themselves as an 'adult' member of a household that already had
-- an owner, with the original policy in place.

create or replace function household_member_count(target_household_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*) from household_members where household_id = target_household_id;
$$;

drop policy "self-join an empty household, or owner adds members" on household_members;

create policy "self-join an empty household, or owner adds members"
  on household_members for insert
  with check (
    user_id = auth.uid()
    and (
      household_member_count(household_id) = 0
      or household_role(household_id) = 'owner'
    )
  );
