-- Fix: creating a household during onboarding always failed with
-- "new row violates row-level security policy for table households" (42501),
-- even though the INSERT policy itself ("any authenticated user can create
-- a household", with_check auth.uid() is not null) is trivially satisfied.
--
-- Root cause: every repository .create() call does
-- `insert(...).select("*").single()`, which asks Postgres for the inserted
-- row back (RETURNING). Postgres enforces RLS on that RETURNING output using
-- the table's SELECT policy, not just the INSERT policy. households' SELECT
-- policy is `is_household_member(id)` — but at the moment a brand-new
-- household is inserted, the current user has NOT been added to
-- household_members yet (that's the very next statement in
-- createHouseholdWithOwner). So the SELECT-policy check on the RETURNING
-- clause fails, and Postgres reports it as an RLS violation on `households`,
-- which is exactly the confusing symptom seen live: the INSERT policy is
-- fine, but the insert still fails.
--
-- Fix: do both inserts (household + owner membership) inside one
-- SECURITY DEFINER function, matching the same bypass-RLS-safely pattern
-- already used by household_role()/is_household_member()/
-- household_member_count() elsewhere in this schema. The function only ever
-- adds auth.uid() itself as owner, so it can't be used to join or create
-- households on someone else's behalf.
create or replace function public.create_household_with_owner(household_name text)
returns households
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household households;
  current_uid uuid := auth.uid();
begin
  if current_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if household_name is null or btrim(household_name) = '' then
    raise exception 'household name is required' using errcode = '22023';
  end if;

  insert into households (name) values (household_name)
  returning * into new_household;

  insert into household_members (household_id, user_id, role)
  values (new_household.id, current_uid, 'owner');

  return new_household;
end;
$$;

grant execute on function public.create_household_with_owner(text) to authenticated;
