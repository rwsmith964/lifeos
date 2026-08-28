-- D-061: Opportunity detection engine. A daily cron scans the next few
-- days (bounded by the NWS forecast horizon — see lib/opportunities/detect.ts)
-- for activities/trip ideas that hit an exceptional weather window AND have
-- enough open calendar time to actually be done, and records a row here so
-- the Brief, the weekend-plan view, and a dedicated /opportunities page can
-- all surface the same detected list without re-running detection.
--
-- Household-readable (like trip_ideas), not owner/adult-restricted like
-- gifts — an opportunity is "hey, Saturday looks great for golf," not a
-- surprise to protect from anyone.

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  activity_id uuid references user_activities (id) on delete cascade,
  trip_idea_id uuid references trip_ideas (id) on delete cascade,
  opportunity_type text not null,
  for_date date not null,
  score integer not null,
  headline text not null,
  reasoning text not null,
  status text not null default 'open',
  detected_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opportunities_type_valid check (opportunity_type in ('activity_window', 'trip_idea_window')),
  constraint opportunities_status_valid check (status in ('open', 'dismissed', 'acted_on')),
  constraint opportunities_score_range check (score between 0 and 100),
  -- Exactly one of activity_id / trip_idea_id is set, matching opportunity_type.
  constraint opportunities_one_target check (
    (opportunity_type = 'activity_window' and activity_id is not null and trip_idea_id is null)
    or (opportunity_type = 'trip_idea_window' and trip_idea_id is not null and activity_id is null)
  )
);

create trigger opportunities_set_updated_at
  before update on opportunities
  for each row execute function set_updated_at();

create index opportunities_household_id_idx on opportunities (household_id);
create index opportunities_status_idx on opportunities (status);
create index opportunities_for_date_idx on opportunities (for_date);

-- Idempotency for the detection job: never insert a second row for the same
-- (household, activity, day) or (household, trip idea, day), even if a
-- prior row for that day was dismissed — re-detecting a dismissed
-- opportunity every cron run would just re-surface something the user
-- already said no to.
create unique index opportunities_activity_for_date_uidx
  on opportunities (household_id, activity_id, for_date)
  where activity_id is not null;
create unique index opportunities_trip_idea_for_date_uidx
  on opportunities (household_id, trip_idea_id, for_date)
  where trip_idea_id is not null;

alter table opportunities enable row level security;

create policy "household members read opportunities"
  on opportunities for select
  using (is_household_member(household_id));

-- Detection itself always runs on the service-role client (the cron job),
-- which bypasses RLS, so there is deliberately no insert policy for
-- regular users here. Dismiss/act-on are the only user-initiated writes.
create policy "owner/adult update opportunities"
  on opportunities for update
  using (household_role(household_id) in ('owner', 'adult'));
