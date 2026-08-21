-- LifeOS: RLS helper functions.
--
-- These are SECURITY DEFINER and STABLE, and bypass RLS internally (they
-- query household_members / household_links directly as the function owner).
-- This is the documented Supabase pattern for avoiding self-referential RLS
-- policies on household_members itself, and keeps every other table's policy
-- a simple, fast function call instead of a repeated subquery.

create or replace function is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from household_members
    where household_id = target_household_id
      and user_id = auth.uid()
  );
$$;

create or replace function household_role(target_household_id uuid)
returns household_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from household_members
  where household_id = target_household_id
    and user_id = auth.uid()
  limit 1;
$$;

-- Household ids readable via an ACTIVE co-parenting link to a household the
-- current user belongs to (Section 6.4). Used by calendar_events RLS for the
-- `shared_with_coparent` visibility tier.
create or replace function linked_household_ids(target_household_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select case when household_a_id = target_household_id then household_b_id else household_a_id end
  from household_links
  where status = 'active'
    and (household_a_id = target_household_id or household_b_id = target_household_id);
$$;

-- True if the current user belongs to a household actively co-parent-linked
-- to target_household_id.
create or replace function is_linked_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from linked_household_ids(target_household_id) linked(household_id)
    where is_household_member(linked.household_id)
  );
$$;
