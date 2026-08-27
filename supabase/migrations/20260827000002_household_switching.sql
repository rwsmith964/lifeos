-- LifeOS: fix D-055's accept flow leaving a joined household invisible to
-- the invitee, plus the underlying gap it exposed (users had no concept of
-- "active household" once membership in more than one became possible).
--
-- Root cause (confirmed via live production verification): requireHouseholdContext()
-- resolves "your household" by finding a `people` row where
-- user_id = you AND relationship_type = 'self' *within* whichever household
-- households[0] happens to be. accept_household_invite() correctly created
-- the household_members row, but never created a matching `people` self
-- record in the newly-joined household — so the invitee had a real,
-- owner-visible membership that their own client could never resolve to,
-- since their only self person row lived in their original household.
-- There was also no way to choose between households at all once someone
-- belonged to more than one.

-- 1. A per-user pointer to which of their households is currently active.
-- Nullable and defaults to null so every existing single-household user is
-- unaffected — requireHouseholdContext() falls back to "first household"
-- when this is unset, exactly as it did before this migration.
alter table users add column active_household_id uuid references households (id) on delete set null;

-- 2. Backfill: create the missing self-person row for any existing
-- household_members row that doesn't have one yet (this is exactly the
-- state the real production "Invitee Three" test account was left in by
-- the pre-fix accept flow). Uses each user's own display_name from
-- `users`, matching what onboarding itself writes for a brand-new
-- household. Idempotent — only inserts where no self person already
-- exists for that (household_id, user_id) pair.
insert into people (household_id, user_id, full_name, relationship_type)
select hm.household_id, hm.user_id, u.display_name, 'self'
from household_members hm
join users u on u.id = hm.user_id
where not exists (
  select 1 from people p
  where p.household_id = hm.household_id
    and p.user_id = hm.user_id
    and p.relationship_type = 'self'
);

-- 3. Point every affected user's active_household_id at a household they
-- actually have a self person in, so the very next page load resolves
-- correctly without requiring them to know a switcher exists. For a user
-- with exactly one membership this is a no-op in practice (it's already
-- the only option); for the real invitee-with-two-households case, this
-- intentionally lands them in the household they most recently joined
-- (highest household_members.created_at), matching the "just accepted an
-- invite" UX recommendation from the verification report.
update users u
set active_household_id = (
  select hm.household_id
  from household_members hm
  where hm.user_id = u.id
  order by hm.created_at desc
  limit 1
)
where active_household_id is null
  and exists (select 1 from household_members hm where hm.user_id = u.id);

-- 4. accept_household_invite() now also creates the invitee's self-person
-- row in the target household (mirroring onboarding's own
-- peopleRepo.create call) and switches their active_household_id to it,
-- so accepting an invite is immediately visible and usable from the
-- invitee's own client on their very next request — no separate manual
-- switch needed for the common case of "I just joined, show me this
-- household." Both steps run inside this SECURITY DEFINER function for
-- the same reason the household_members insert already does: the
-- invitee's own RLS-checked "owner/adult manage people" insert policy
-- would reject a 'viewer'-role invitee inserting their own self row, so
-- this can't be a plain client-side insert once 'viewer' is allowed to be
-- invited (it is, per the check constraint on household_invites.role).
create or replace function public.accept_household_invite(p_token uuid)
returns household_members
language plpgsql
security definer
set search_path = public
as $$
declare
  inv household_invites;
  current_uid uuid := auth.uid();
  current_email text;
  current_display_name text;
  new_member household_members;
begin
  if current_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select email into current_email from auth.users where id = current_uid;

  select * into inv from household_invites where token = p_token for update;
  if inv.id is null then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;

  if inv.status = 'accepted' then
    raise exception 'this invite has already been used' using errcode = '22023';
  end if;
  if inv.status = 'revoked' then
    raise exception 'this invite has been revoked' using errcode = '22023';
  end if;
  if inv.status = 'expired' or inv.expires_at < now() then
    if inv.status <> 'expired' then
      update household_invites set status = 'expired' where id = inv.id;
    end if;
    raise exception 'this invite has expired' using errcode = '22023';
  end if;

  if current_email is null or lower(current_email) <> lower(inv.invited_email) then
    raise exception 'this invite was sent to a different email address' using errcode = '42501';
  end if;

  insert into household_members (household_id, user_id, role)
  values (inv.household_id, current_uid, inv.role)
  on conflict (household_id, user_id) do nothing
  returning * into new_member;

  update household_invites
  set status = 'accepted', accepted_by_user_id = current_uid
  where id = inv.id;

  if new_member.id is null then
    -- Already a member of this household (e.g. re-clicking an old invite
    -- link after having joined some other way) — return the existing row
    -- rather than erroring, so acceptance is idempotent.
    select * into new_member from household_members where household_id = inv.household_id and user_id = current_uid;
  end if;

  -- Create the invitee's self-person row in the target household if one
  -- doesn't already exist there (idempotent — matters for the
  -- already-a-member re-accept path above too).
  if not exists (
    select 1 from people
    where household_id = inv.household_id and user_id = current_uid and relationship_type = 'self'
  ) then
    select display_name into current_display_name from users where id = current_uid;
    insert into people (household_id, user_id, full_name, relationship_type)
    values (inv.household_id, current_uid, coalesce(current_display_name, split_part(current_email, '@', 1)), 'self');
  end if;

  -- Land the invitee in the household they just joined on their very next
  -- request — this is a fresh acceptance, so "the household you were just
  -- invited into" is the reasonable default active household, and this is
  -- exactly what a switcher would let them do manually anyway.
  update users set active_household_id = inv.household_id where id = current_uid;

  return new_member;
end;
$$;
