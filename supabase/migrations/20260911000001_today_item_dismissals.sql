-- LifeOS: today_item_dismissals -- B2 (audit pass 2026-09-11): "No dismiss,
-- no snooze, no 'not this week'. The two reach-out cards have been
-- returning daily for nine days." Today's priority items are recomputed
-- fresh on every visit from underlying data (contact cadences, gift
-- occasions, opportunities, household state) -- there was nowhere to
-- record "I've seen this, stop showing it" before now. One row per
-- (person, stable item key) with a `hidden_until` date: a plain Dismiss
-- hides the item for the rest of today (hidden_until = tomorrow), Snooze
-- hides it for a stated number of days. Re-evaluated fresh each request --
-- once hidden_until passes, the item reappears on its own if the
-- underlying condition (e.g. still overdue) still holds.

create table today_item_dismissals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  person_id uuid not null references people (id) on delete cascade,
  item_key text not null,
  hidden_until date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index today_item_dismissals_person_key_unique on today_item_dismissals (person_id, item_key);
create index today_item_dismissals_household_id_idx on today_item_dismissals (household_id);

create trigger today_item_dismissals_set_updated_at
  before update on today_item_dismissals
  for each row execute function set_updated_at();

alter table today_item_dismissals enable row level security;

-- A dismissal is personal to the viewer whose Today page it hides an item
-- from -- read/write is scoped to the owning person's own auth user, not
-- the whole household (unlike most tables here, where any household
-- member manages shared data).
create policy "viewer reads their own dismissals"
  on today_item_dismissals for select
  using (
    exists (
      select 1 from people p
      where p.id = today_item_dismissals.person_id
        and p.user_id = auth.uid()
    )
  );

create policy "viewer inserts their own dismissals"
  on today_item_dismissals for insert
  with check (
    exists (
      select 1 from people p
      where p.id = today_item_dismissals.person_id
        and p.user_id = auth.uid()
        and p.household_id = today_item_dismissals.household_id
    )
  );

create policy "viewer updates their own dismissals"
  on today_item_dismissals for update
  using (
    exists (
      select 1 from people p
      where p.id = today_item_dismissals.person_id
        and p.user_id = auth.uid()
    )
  );

create policy "viewer deletes their own dismissals"
  on today_item_dismissals for delete
  using (
    exists (
      select 1 from people p
      where p.id = today_item_dismissals.person_id
        and p.user_id = auth.uid()
    )
  );
