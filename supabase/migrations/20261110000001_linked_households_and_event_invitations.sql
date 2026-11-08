-- LifeOS: linking people across households, choosing what is shared, and
-- event invitations.
--
-- 1. people.linked_user_id: this person record IS that LifeOS account (a
--    brother-in-law with his own household). Same-household members use
--    people.user_id as before.
-- 2. household_link_invites + accept_link_invite(): invite someone by email
--    to link households. Accepting creates the (already existing) active
--    household_links row, which also switches on the 'shared_with_coparent'
--    event visibility tier that has existed since v1 but had no way to be
--    created.
-- 3. household_link_shares: per link, per direction, per category: what a
--    household lets the other one see. Private by default.
-- 4. linked_busy_blocks() / linked_custody_blocks(): the ONLY way another
--    household's schedule is read, and only the time ranges, never titles.
-- 5. person_groups, event itinerary / host / per-person notes, and
--    event_invitations (RSVP for people inside or outside LifeOS).

alter table people add column linked_user_id uuid references users (id) on delete set null;
create index people_linked_user_id_idx on people (linked_user_id) where linked_user_id is not null;

-- ---------------------------------------------------------------- link invites

create table household_link_invites (
  id uuid primary key default gen_random_uuid(),
  from_household_id uuid not null references households (id) on delete cascade,
  from_user_id uuid not null references users (id),
  -- The person in the inviting household this invite is for ("Rusty").
  for_person_id uuid references people (id) on delete set null,
  invited_email text not null,
  token uuid not null unique default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  accepted_by_user_id uuid references users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days')
);

create index household_link_invites_household_idx on household_link_invites (from_household_id);
create unique index household_link_invites_pending_idx
  on household_link_invites (from_household_id, lower(invited_email))
  where status = 'pending';

alter table household_link_invites enable row level security;

create policy "owners/adults read their link invites"
  on household_link_invites for select
  using (household_role(from_household_id) in ('owner', 'adult'));

create policy "owners/adults send link invites"
  on household_link_invites for insert
  with check (household_role(from_household_id) in ('owner', 'adult') and from_user_id = auth.uid());

create policy "owners/adults update their link invites"
  on household_link_invites for update
  using (household_role(from_household_id) in ('owner', 'adult'));

-- Public preview for the accept page (reachable before signing in).
create or replace function public.get_link_invite_preview(p_token uuid)
returns table (household_name text, invited_by text, invited_email text, status text, expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select h.name, u.display_name, i.invited_email, i.status, i.expires_at
  from household_link_invites i
  join households h on h.id = i.from_household_id
  join users u on u.id = i.from_user_id
  where i.token = p_token;
$$;

grant execute on function public.get_link_invite_preview(uuid) to authenticated, anon;

-- Accept a link invite on behalf of the CALLING user, into one of THEIR
-- households. p_person_for_them: which existing person in the caller's
-- household is the inviter; or p_new_person_name to add them as a new friend.
create or replace function public.accept_link_invite(
  p_token uuid,
  p_my_household uuid,
  p_person_for_them uuid default null,
  p_new_person_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv household_link_invites;
  current_uid uuid := auth.uid();
  current_email text;
  link_id uuid;
begin
  if current_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select email into current_email from auth.users where id = current_uid;

  select * into inv from household_link_invites where token = p_token for update;
  if inv.id is null then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;
  if inv.status <> 'pending' or inv.expires_at < now() then
    raise exception 'this invite is no longer valid' using errcode = '22023';
  end if;
  if current_email is null or lower(current_email) <> lower(inv.invited_email) then
    raise exception 'this invite was sent to a different email address' using errcode = '42501';
  end if;
  if household_role(p_my_household) is null or household_role(p_my_household) not in ('owner', 'adult') then
    raise exception 'you must be an owner or adult of the household you are linking' using errcode = '42501';
  end if;
  if p_my_household = inv.from_household_id then
    raise exception 'you cannot link a household to itself' using errcode = '22023';
  end if;

  insert into household_links (household_a_id, household_b_id, status)
  values (inv.from_household_id, p_my_household, 'active')
  on conflict (least(household_a_id, household_b_id), greatest(household_a_id, household_b_id))
  do update set status = 'active'
  returning id into link_id;

  -- The inviter's record of the invitee now points at the invitee's account.
  if inv.for_person_id is not null then
    update people set linked_user_id = current_uid
    where id = inv.for_person_id and household_id = inv.from_household_id;
  end if;

  -- And the invitee's record of the inviter points back.
  if p_person_for_them is not null then
    update people set linked_user_id = inv.from_user_id
    where id = p_person_for_them and household_id = p_my_household;
  elsif p_new_person_name is not null and length(trim(p_new_person_name)) > 0 then
    insert into people (household_id, full_name, relationship_type, linked_user_id)
    values (p_my_household, trim(p_new_person_name), 'friend', inv.from_user_id);
  end if;

  update household_link_invites set status = 'accepted', accepted_by_user_id = current_uid where id = inv.id;
  return link_id;
end;
$$;

grant execute on function public.accept_link_invite(uuid, uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------- sharing

create table household_link_shares (
  link_id uuid not null references household_links (id) on delete cascade,
  -- The household doing the sharing (what it lets the OTHER side see).
  sharing_household_id uuid not null references households (id) on delete cascade,
  -- busy_times: when I am busy (no titles or details).
  -- custody:    when I have the kids (no names).
  category text not null check (category in ('busy_times', 'custody')),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (link_id, sharing_household_id, category)
);

alter table household_link_shares enable row level security;

-- Both sides can see what is being shared; only the sharing household changes it.
create policy "either side reads link shares"
  on household_link_shares for select
  using (
    exists (
      select 1 from household_links l
      where l.id = household_link_shares.link_id
        and (is_household_member(l.household_a_id) or is_household_member(l.household_b_id))
    )
  );

create policy "sharing household sets its shares"
  on household_link_shares for insert
  with check (
    household_role(sharing_household_id) in ('owner', 'adult')
    and exists (
      select 1 from household_links l
      where l.id = household_link_shares.link_id
        and sharing_household_id in (l.household_a_id, l.household_b_id)
    )
  );

create policy "sharing household changes its shares"
  on household_link_shares for update
  using (household_role(sharing_household_id) in ('owner', 'adult'));

create policy "sharing household removes its shares"
  on household_link_shares for delete
  using (household_role(sharing_household_id) in ('owner', 'adult'));

-- Is p_other_household letting the calling user's household see `p_category`?
create or replace function public.is_category_shared_with_me(p_other_household uuid, p_category text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from household_links l
    join household_link_shares s on s.link_id = l.id
    where l.status = 'active'
      and s.sharing_household_id = p_other_household
      and s.category = p_category
      and s.enabled
      and (
        (l.household_a_id = p_other_household and is_household_member(l.household_b_id))
        or (l.household_b_id = p_other_household and is_household_member(l.household_a_id))
      )
  );
$$;

-- Just the time ranges the other household is busy; never titles or details.
create or replace function public.linked_busy_blocks(p_other_household uuid, p_start timestamptz, p_end timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz, all_day boolean)
language sql
stable
security definer
set search_path = public
as $$
  select e.starts_at, e.ends_at, e.all_day
  from calendar_events e
  where e.household_id = p_other_household
    and e.starts_at < p_end
    and e.ends_at > p_start
    and is_category_shared_with_me(p_other_household, 'busy_times');
$$;

-- Just the time ranges the other household's account holder has the kids.
create or replace function public.linked_custody_blocks(p_other_household uuid, p_start timestamptz, p_end timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select b.starts_at, b.ends_at
  from custody_blocks b
  join people p on p.id = b.responsible_person_id
  where p.household_id = p_other_household
    and p.relationship_type = 'self'
    and b.starts_at < p_end
    and b.ends_at > p_start
    and is_category_shared_with_me(p_other_household, 'custody');
$$;

grant execute on function public.is_category_shared_with_me(uuid, text) to authenticated;
grant execute on function public.linked_busy_blocks(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.linked_custody_blocks(uuid, timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------- groups

create table person_groups (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  member_person_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger person_groups_set_updated_at
  before update on person_groups
  for each row execute function set_updated_at();
create index person_groups_household_idx on person_groups (household_id);

alter table person_groups enable row level security;

create policy "members read groups" on person_groups for select using (is_household_member(household_id));
create policy "owner/adult add groups" on person_groups for insert with check (household_role(household_id) in ('owner', 'adult'));
create policy "owner/adult edit groups" on person_groups for update using (household_role(household_id) in ('owner', 'adult'));
create policy "owner/adult delete groups" on person_groups for delete using (household_role(household_id) in ('owner', 'adult'));

-- ---------------------------------------------------------------- event details

alter table calendar_events add column itinerary jsonb not null default '[]'::jsonb;
-- Hosted at someone's house: that person's address fills the location.
alter table calendar_events add column host_person_id uuid references people (id) on delete set null;
alter table event_attendees add column personal_notes text not null default '';

-- ---------------------------------------------------------------- invitations

create table event_invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references calendar_events (id) on delete cascade,
  household_id uuid not null references households (id) on delete cascade,
  -- Who in the host's household this invitation is for, if anyone.
  person_id uuid references people (id) on delete set null,
  -- A LifeOS account to deliver it to in-app, and/or an email to send it to.
  invitee_user_id uuid references users (id) on delete set null,
  invitee_email text,
  token uuid not null unique default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'maybe')),
  -- A note written for just this person ("bring the green bean casserole").
  personal_notes text not null default '',
  responded_at timestamptz,
  -- The invitee's own calendar entry, once they accept (inside their household).
  invitee_event_id uuid references calendar_events (id) on delete set null,
  created_at timestamptz not null default now(),
  check (invitee_user_id is not null or invitee_email is not null)
);

create index event_invitations_event_idx on event_invitations (event_id);
create index event_invitations_invitee_user_idx on event_invitations (invitee_user_id) where invitee_user_id is not null;

alter table event_invitations enable row level security;

-- The host household manages invitations.
create policy "host household reads invitations"
  on event_invitations for select
  using (is_household_member(household_id) or invitee_user_id = auth.uid());

create policy "host owner/adult creates invitations"
  on event_invitations for insert
  with check (
    household_role(household_id) in ('owner', 'adult')
    and exists (select 1 from calendar_events e where e.id = event_invitations.event_id and e.household_id = event_invitations.household_id)
  );

create policy "host owner/adult updates invitations"
  on event_invitations for update
  using (household_role(household_id) in ('owner', 'adult'));

create policy "host owner/adult deletes invitations"
  on event_invitations for delete
  using (household_role(household_id) in ('owner', 'adult'));

-- What an invitee sees: the event's public details plus their own note. Works
-- for an anonymous visitor holding the token (the emailed RSVP link) and for
-- a signed-in account the invitation was addressed to. Never reveals who else
-- was invited.
create or replace function public.get_event_invitation(p_token uuid)
returns table (
  invitation_id uuid,
  status text,
  personal_notes text,
  event_title text,
  event_description text,
  starts_at timestamptz,
  ends_at timestamptz,
  all_day boolean,
  location text,
  location_lat double precision,
  location_lng double precision,
  itinerary jsonb,
  host_household text,
  host_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.status, i.personal_notes,
         e.title, e.description, e.starts_at, e.ends_at, e.all_day, e.location, e.location_lat, e.location_lng,
         e.itinerary, h.name, coalesce(hp.nickname, hp.full_name)
  from event_invitations i
  join calendar_events e on e.id = i.event_id
  join households h on h.id = i.household_id
  left join people hp on hp.id = e.created_by_person_id
  where i.token = p_token;
$$;

grant execute on function public.get_event_invitation(uuid) to authenticated, anon;

-- Accept / decline / maybe by token. Anonymous allowed: the token is the secret.
create or replace function public.respond_event_invitation(p_token uuid, p_status text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('accepted', 'declined', 'maybe') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  update event_invitations set status = p_status, responded_at = now() where token = p_token;
  if not found then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;
  return p_status;
end;
$$;

grant execute on function public.respond_event_invitation(uuid, text) to authenticated, anon;

-- A signed-in invitee records which of THEIR calendar entries is this event.
create or replace function public.link_invitation_copy(p_token uuid, p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update event_invitations
  set invitee_event_id = p_event_id
  where token = p_token
    and invitee_user_id = auth.uid()
    and exists (select 1 from calendar_events e where e.id = p_event_id and is_household_member(e.household_id));
end;
$$;

grant execute on function public.link_invitation_copy(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- joining

-- Someone who just accepted a household invite says which existing person they
-- are (a spouse already in People) or adds themselves as new. SECURITY DEFINER
-- because a read-only (viewer) member could not otherwise claim their own
-- record; scoped to the caller's own membership.
create or replace function public.claim_household_person(
  p_household uuid,
  p_person_id uuid default null,
  p_new_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_result uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not is_household_member(p_household) then
    raise exception 'you are not a member of that household' using errcode = '42501';
  end if;

  select id into v_result from people where household_id = p_household and user_id = v_uid limit 1;
  if v_result is not null then
    return v_result;
  end if;

  select au.email into v_email from auth.users au where au.id = v_uid;

  if p_person_id is not null then
    update people
    set user_id = v_uid, email = coalesce(people.email, v_email)
    where id = p_person_id
      and household_id = p_household
      and user_id is null
      and relationship_type <> 'self'
    returning id into v_result;
    if v_result is null then
      raise exception 'that person is not available to claim' using errcode = '22023';
    end if;
  elsif p_new_name is not null and length(trim(p_new_name)) > 0 then
    insert into people (household_id, user_id, full_name, relationship_type, email)
    values (p_household, v_uid, trim(p_new_name), 'other', v_email)
    returning id into v_result;
  else
    raise exception 'choose a person or enter a name' using errcode = '22023';
  end if;

  return v_result;
end;
$$;

grant execute on function public.claim_household_person(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------- directory

-- Who the calling household is linked to: for each active link, the other
-- household's name and its owner/adult account holders. The other household's
-- rows are otherwise unreadable, so this is the one place names come from.
create or replace function public.list_linked_accounts(p_household uuid)
returns table (
  link_id uuid,
  other_household_id uuid,
  other_household_name text,
  user_id uuid,
  user_display_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select l.id,
         other.id,
         other.name,
         hm.user_id,
         u.display_name
  from household_links l
  join households other
    on other.id = case when l.household_a_id = p_household then l.household_b_id else l.household_a_id end
  join household_members hm on hm.household_id = other.id and hm.role in ('owner', 'adult')
  join users u on u.id = hm.user_id
  where l.status = 'active'
    and (l.household_a_id = p_household or l.household_b_id = p_household)
    and is_household_member(p_household);
$$;

grant execute on function public.list_linked_accounts(uuid) to authenticated;

-- ---------------------------------------------------------------- roles

-- A teen with their own login: sees the household but never gift plans (the
-- 'child' role has always been spoiler-safe in RLS). Invites could only offer
-- adult or viewer before.
alter table household_invites drop constraint if exists household_invites_role_check;
alter table household_invites add constraint household_invites_role_check check (role in ('adult', 'viewer', 'child'));
