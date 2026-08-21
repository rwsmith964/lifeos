-- LifeOS: calendar_events, event_attendees, custody_blocks.
-- This migration carries the co-parent visibility model described in
-- Section 6.4 — the part that "requires care."

create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  created_by_person_id uuid not null references people (id) on delete cascade,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  location text,
  location_lat numeric,
  location_lng numeric,
  travel_time_before_minutes integer,
  prep_time_before_minutes integer,
  event_type calendar_event_type not null default 'personal',
  -- Default visibility is private; sharing is an explicit act (Section 6.4).
  visibility event_visibility not null default 'private',
  external_source text,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_end_after_start check (ends_at >= starts_at)
);

create trigger calendar_events_set_updated_at
  before update on calendar_events
  for each row execute function set_updated_at();

create index calendar_events_household_starts_idx on calendar_events (household_id, starts_at);
create index calendar_events_created_by_idx on calendar_events (created_by_person_id);
create index calendar_events_visibility_idx on calendar_events (visibility);

create or replace function event_created_by_me(target_created_by_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from people p
    where p.id = target_created_by_person_id
      and p.user_id = auth.uid()
  );
$$;

alter table calendar_events enable row level security;

create policy "read own private events, household events, or linked shared events"
  on calendar_events for select
  using (
    event_created_by_me(created_by_person_id)
    or (visibility in ('household', 'shared_with_coparent') and is_household_member(household_id))
    or (visibility = 'shared_with_coparent' and is_linked_household_member(household_id))
  );

create policy "owner/adult create events"
  on calendar_events for insert
  with check (is_household_member(household_id) and household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult update own-household events"
  on calendar_events for update
  using (household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult delete own-household events"
  on calendar_events for delete
  using (household_role(household_id) in ('owner', 'adult'));

-- event_attendees -----------------------------------------------------

create table event_attendees (
  id uuid primary key default gen_random_uuid(),
  calendar_event_id uuid not null references calendar_events (id) on delete cascade,
  person_id uuid not null references people (id) on delete cascade,
  attendance_status attendance_status not null default 'required',
  unique (calendar_event_id, person_id)
);

create index event_attendees_calendar_event_id_idx on event_attendees (calendar_event_id);
create index event_attendees_person_id_idx on event_attendees (person_id);

alter table event_attendees enable row level security;

create policy "readable if the parent event is readable"
  on event_attendees for select
  using (
    exists (
      select 1 from calendar_events e
      where e.id = event_attendees.calendar_event_id
        and (
          event_created_by_me(e.created_by_person_id)
          or (e.visibility in ('household', 'shared_with_coparent') and is_household_member(e.household_id))
          or (e.visibility = 'shared_with_coparent' and is_linked_household_member(e.household_id))
        )
    )
  );

create policy "owner/adult manage attendees insert"
  on event_attendees for insert
  with check (
    exists (
      select 1 from calendar_events e
      where e.id = event_attendees.calendar_event_id
        and household_role(e.household_id) in ('owner', 'adult')
    )
  );

create policy "owner/adult manage attendees update"
  on event_attendees for update
  using (
    exists (
      select 1 from calendar_events e
      where e.id = event_attendees.calendar_event_id
        and household_role(e.household_id) in ('owner', 'adult')
    )
  );

create policy "owner/adult manage attendees delete"
  on event_attendees for delete
  using (
    exists (
      select 1 from calendar_events e
      where e.id = event_attendees.calendar_event_id
        and household_role(e.household_id) in ('owner', 'adult')
    )
  );

-- custody_blocks --------------------------------------------------------
-- In the schema from day one; no co-parent UI in v1 (Section 6.4).

create table custody_blocks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  child_person_id uuid not null references people (id) on delete cascade,
  responsible_person_id uuid not null references people (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  block_type custody_block_type not null default 'regular',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custody_blocks_end_after_start check (ends_at >= starts_at)
);

create trigger custody_blocks_set_updated_at
  before update on custody_blocks
  for each row execute function set_updated_at();

create index custody_blocks_child_starts_idx on custody_blocks (child_person_id, starts_at);
create index custody_blocks_household_id_idx on custody_blocks (household_id);
create index custody_blocks_responsible_person_id_idx on custody_blocks (responsible_person_id);

alter table custody_blocks enable row level security;

create policy "household members read custody blocks"
  on custody_blocks for select
  using (is_household_member(household_id));

create policy "owner/adult insert custody blocks"
  on custody_blocks for insert
  with check (is_household_member(household_id) and household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult update custody blocks"
  on custody_blocks for update
  using (household_role(household_id) in ('owner', 'adult'));

create policy "owner/adult delete custody blocks"
  on custody_blocks for delete
  using (household_role(household_id) in ('owner', 'adult'));
