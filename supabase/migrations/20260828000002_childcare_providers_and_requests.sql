-- LifeOS: childcare provider tagging + childcare request/accept-decline flow
-- (D-060, per Richard's clarifying answer: "let's also be able to input
-- childcare providers or also flag a contact, like my mom ... as a
-- childcare provider ... invite people like that to the app ... send a
-- notification ... with the specific details and a custom note and have
-- them accept or deny the request and then have it build that into the
-- plan ... it builds in drive and drop off time into the plan.")
--
-- Design notes:
-- 1. A childcare provider is very often NOT a LifeOS account holder (e.g.
--    "my mom") — unlike household_invites (20260827000001), which invites
--    someone to become an authenticated member of the household, this flow
--    must work for a plain email recipient with no LifeOS login at all.
--    So the accept/decline RPC below is deliberately token-only, with NO
--    auth.uid() check anywhere — the 128-bit token is the sole secret,
--    mirroring get_household_invite_preview's "no auth needed to preview"
--    half of that migration, but extended to the WRITE (respond) side too,
--    since there's no account to authenticate as afterward.
-- 2. Addresses live on `people` (not a separate table) — home_address/
--    home_lat/home_lng already exists on `users` for the household owner
--    (20260826000001-ish, see app/(app)/settings/actions.ts) using the
--    same geocode-on-save pattern this migration's app code reuses for a
--    provider's address.

alter table people
  add column is_childcare_provider boolean not null default false,
  add column address text,
  add column address_lat double precision,
  add column address_lng double precision;

create table childcare_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  requested_by_person_id uuid not null references people (id),
  provider_person_id uuid not null references people (id),
  -- Which of the household's kids this request covers. Not a foreign-key
  -- array (Postgres has no native array FK) — validated at the app layer
  -- against the household's own `people` rows, same pattern as
  -- trip_ideas.companion_person_ids (20260828000001).
  child_person_ids uuid[] not null default '{}',
  care_date date not null,
  care_start_time time not null,
  care_end_time time not null,
  -- What the requester is actually doing while childcare covers them, e.g.
  -- "Date night" or "Client dinner" — optional context for the provider,
  -- distinct from the free-text custom_note below.
  event_title text,
  custom_note text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  token uuid not null unique default gen_random_uuid(),
  -- Computed once at request-creation time from the household owner's
  -- home_lat/home_lng (Settings) to the provider's address_lat/address_lng
  -- (lib/external/travel.ts — Google/Mapbox if configured, otherwise the
  -- same haversine fallback already used by activity planning). Null when
  -- either endpoint isn't geocoded yet; the UI degrades gracefully to "no
  -- drive-time estimate available" rather than blocking the request.
  drive_minutes_to_provider integer,
  drive_time_source text,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (care_end_time > care_start_time)
);

create index childcare_requests_household_id_idx on childcare_requests (household_id);
create index childcare_requests_provider_person_id_idx on childcare_requests (provider_person_id);

create trigger childcare_requests_set_updated_at
  before update on childcare_requests
  for each row execute function set_updated_at();

alter table childcare_requests enable row level security;

create policy "members can read their household's childcare requests"
  on childcare_requests for select
  using (is_household_member(household_id));

create policy "owner or adult can create childcare requests"
  on childcare_requests for insert
  with check (
    is_household_member(household_id)
    and household_role(household_id) in ('owner', 'adult')
  );

-- Covers cancelling a still-pending request from the requester's own UI.
-- The accept/decline path goes through respond_to_childcare_request()
-- below instead, since the provider is very often not a household member
-- (frequently not a LifeOS user at all) and couldn't satisfy
-- is_household_member() to update the row directly.
create policy "owner or adult can update their household's childcare requests"
  on childcare_requests for update
  using (is_household_member(household_id) and household_role(household_id) in ('owner', 'adult'))
  with check (is_household_member(household_id));

-- Public, unauthenticated preview for the emailed accept/decline link —
-- same shape/intent as get_household_invite_preview. Returns only what the
-- provider needs to decide: who's asking, which kids, when, why, the
-- custom note, and (if available) how far a drop-off drive would be —
-- never the household's internal id or any other household member's data.
create or replace function public.get_childcare_request_preview(p_token uuid)
returns table (
  household_name text,
  requester_name text,
  provider_name text,
  child_names text[],
  care_date date,
  care_start_time time,
  care_end_time time,
  event_title text,
  custom_note text,
  status text,
  expires_at timestamptz,
  drive_minutes_to_provider integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    h.name,
    requester.full_name,
    provider.full_name,
    coalesce(
      (select array_agg(coalesce(c.nickname, c.full_name) order by c.full_name)
       from people c where c.id = any (r.child_person_ids)),
      '{}'
    ),
    r.care_date,
    r.care_start_time,
    r.care_end_time,
    r.event_title,
    r.custom_note,
    r.status,
    r.expires_at,
    r.drive_minutes_to_provider
  from childcare_requests r
  join households h on h.id = r.household_id
  join people requester on requester.id = r.requested_by_person_id
  join people provider on provider.id = r.provider_person_id
  where r.token = p_token;
$$;

grant execute on function public.get_childcare_request_preview(uuid) to authenticated, anon;

-- Accept or decline a childcare request purely by token — deliberately NO
-- auth.uid() check anywhere in this function (unlike
-- accept_household_invite, which requires the caller to be signed in as
-- the exact invited email). A childcare provider like "my mom" usually
-- has no LifeOS account to sign into at all, so the token itself (128
-- bits, emailed only to the provider) is the entire security boundary
-- here — the same trust model as a typical "click to unsubscribe" or
-- "click to RSVP" link.
create or replace function public.respond_to_childcare_request(p_token uuid, p_response text)
returns childcare_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  req childcare_requests;
begin
  if p_response not in ('accepted', 'declined') then
    raise exception 'invalid response' using errcode = '22023';
  end if;

  select * into req from childcare_requests where token = p_token for update;
  if req.id is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if req.status <> 'pending' then
    raise exception 'this request has already been responded to or is no longer open' using errcode = '22023';
  end if;

  if req.expires_at < now() then
    update childcare_requests set status = 'expired' where id = req.id;
    raise exception 'this request has expired' using errcode = '22023';
  end if;

  update childcare_requests
  set status = p_response, responded_at = now()
  where id = req.id
  returning * into req;

  return req;
end;
$$;

grant execute on function public.respond_to_childcare_request(uuid, text) to authenticated, anon;
