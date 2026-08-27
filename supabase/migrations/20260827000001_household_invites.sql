-- LifeOS: household membership invites (Phase 4.1 / Section 6.4's sibling
-- feature — inviting a SECOND ADULT INTO YOUR OWN household, as distinct
-- from household_links' cross-household co-parenting model, which remains
-- schema-only per the comment on that table).
--
-- Why an RPC-driven accept flow, not a direct household_members INSERT:
-- household_members' own INSERT policy (fixed in D-026,
-- 20260820000018_fix_household_members_bootstrap_rls.sql) requires
-- `user_id = auth.uid()` in every case — including the "owner adds members"
-- branch, which really only ever let an owner re-insert THEMSELVES, not add
-- someone else. There is no direct-INSERT path by which an owner can add a
-- different person as a member; the only way to add someone else is for
-- that person to insert their own row, which by definition means them
-- accepting an invite themselves. This migration adds the invite record
-- and a SECURITY DEFINER acceptance function, following the exact same
-- bypass-RLS-safely pattern as create_household_with_owner
-- (20260826000001) for the same reason: the invitee isn't a household
-- member yet at the moment they need to become one.

create table household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  invited_email text not null,
  role household_role not null default 'adult',
  invited_by_user_id uuid not null references users (id),
  token uuid not null unique default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  accepted_by_user_id uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  -- Role is intentionally restricted to the two roles that make sense for
  -- an invited adult joining an existing household: 'adult' (full
  -- read/write, same as the owner) or 'viewer' (read-only, Section 6.3).
  -- 'owner' is excluded — ownership isn't transferable via invite in v1
  -- (no UI for it either) — and 'child' is excluded because child records
  -- are created directly as people rows, not invited as separate user
  -- accounts (Section 4.1's model has no concept of a child logging in).
  check (role in ('adult', 'viewer'))
);

create index household_invites_household_id_idx on household_invites (household_id);

-- Prevent duplicate pending invites to the same email for the same
-- household (re-inviting after revoke/expiry is fine — this only blocks
-- having two simultaneously-pending invites outstanding for one address).
create unique index household_invites_pending_email_idx
  on household_invites (household_id, lower(invited_email))
  where status = 'pending';

create trigger household_invites_set_updated_at
  before update on household_invites
  for each row execute function set_updated_at();

alter table household_invites enable row level security;

-- Members can see every invite (pending, accepted, revoked, expired) for
-- their own household, so the settings page can render a full history —
-- this table holds nothing sensitive beyond an email address, which any
-- household member could already see for existing members via the
-- household_members join, so this isn't a materially bigger disclosure.
create policy "members can read their household's invites"
  on household_invites for select
  using (is_household_member(household_id));

-- Only an owner or adult may invite someone new — mirrors the write-role
-- check already used identically for people/activities/calendar_events/
-- custody_schedules ('owner', 'adult' can write; 'viewer' cannot).
create policy "owner or adult can create invites"
  on household_invites for insert
  with check (
    is_household_member(household_id)
    and household_role(household_id) in ('owner', 'adult')
    and invited_by_user_id = auth.uid()
  );

-- Only for revoking a still-pending invite from the UI (status ->
-- 'revoked'); the accept path goes through accept_household_invite()
-- below instead, since the accepting user isn't a member yet and this
-- policy alone couldn't let them satisfy is_household_member().
create policy "owner or adult can revoke invites"
  on household_invites for update
  using (is_household_member(household_id) and household_role(household_id) in ('owner', 'adult'))
  with check (is_household_member(household_id));

-- Preview an invite by its token WITHOUT requiring the caller to be
-- authenticated or a household member yet — needed so a logged-out visitor
-- clicking an emailed invite link can see "You've been invited to join the
-- Smith Household by Richard" before signing in or creating an account.
-- Deliberately returns only non-sensitive fields (no household_id, no raw
-- invited_by_user_id) — just enough to render the preview screen.
create or replace function public.get_household_invite_preview(p_token uuid)
returns table (
  household_name text,
  invited_email text,
  inviter_name text,
  role household_role,
  status text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select h.name, i.invited_email, u.display_name, i.role, i.status, i.expires_at
  from household_invites i
  join households h on h.id = i.household_id
  join users u on u.id = i.invited_by_user_id
  where i.token = p_token;
$$;

grant execute on function public.get_household_invite_preview(uuid) to authenticated, anon;

-- Accept an invite: adds the CALLING user (never anyone else — auth.uid()
-- is read server-side, not passed as a parameter, so this can't be used to
-- join another user to a household on their behalf) as a household_members
-- row, provided the invite is pending, unexpired, and addressed to the
-- calling user's own account email. Runs as SECURITY DEFINER for the same
-- bootstrap reason create_household_with_owner does: the caller isn't a
-- household_members row yet, so no ordinary RLS-checked INSERT policy
-- could let them add themselves as a member of a household that already
-- has an owner.
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

  -- Guards against a leaked/forwarded invite link being usable by anyone
  -- other than the intended recipient, even though the token itself is
  -- already the primary secret. Cheap extra check, same spirit as D-044's
  -- reset-password flow-proof cookie.
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

  return new_member;
end;
$$;

grant execute on function public.accept_household_invite(uuid) to authenticated;

-- users' table (public schema) deliberately has no email column — email
-- lives only on Postgres's own auth.users, which PostgREST doesn't expose
-- to the anon/authenticated roles at all. Settings' "invite someone" form
-- needs to warn when the typed email already belongs to a current member,
-- and that's the one place in this feature that genuinely needs it. This
-- SECURITY DEFINER function is scoped tightly: it requires the CALLING
-- user to already be a member of the household in question (checked
-- inside the function, not left to a table-level RLS policy, since
-- auth.users has no RLS of its own to lean on), and only ever returns
-- emails for that one household's actual members — never an
-- unrestricted auth.users dump.
create or replace function public.household_member_emails(p_household_id uuid)
returns table (user_id uuid, email text)
language sql
stable
security definer
set search_path = public
as $$
  select hm.user_id, au.email
  from household_members hm
  join auth.users au on au.id = hm.user_id
  where hm.household_id = p_household_id
    and is_household_member(p_household_id);
$$;

grant execute on function public.household_member_emails(uuid) to authenticated;

-- Lets a non-owner member leave a household voluntarily. The existing
-- "owners remove members" DELETE policy (20260820000005) only lets an
-- OWNER remove someone; it never let a member remove THEMSELVES, so an
-- invited adult/viewer had no way to leave once joined. Owners are
-- deliberately excluded from self-removal here — leaving would strand the
-- household without an owner, and there is no ownership-transfer feature
-- to pair with it yet; an owner who wants out deletes the whole household
-- instead (an existing, intentional, more drastic action).
create policy "non-owner members can leave a household"
  on household_members for delete
  using (user_id = auth.uid() and role <> 'owner');

-- Closes a real gap this feature's own test suite caught: the pre-existing
-- "owners remove members" policy (20260820000005) checks only the CALLING
-- user's role (household_role(household_id) = 'owner') and never excludes
-- the target row from being the caller's own membership — so an owner
-- could already delete their OWN household_members row directly via that
-- policy, contradicting this migration's stated design (owners leave only
-- by deleting the whole household) and making app-code's leaveHousehold
-- owner-check a UI-only, not RLS-enforced, guard. Re-scope that policy to
-- other members only; self-removal for an owner has no policy path at all
-- now (matching the comment above, for real).
drop policy "owners remove members" on household_members;

create policy "owners remove other members"
  on household_members for delete
  using (household_role(household_id) = 'owner' and user_id <> auth.uid());
