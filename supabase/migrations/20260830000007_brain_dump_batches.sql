-- P3-7: keep the original brain-dump transcript stored with the batch,
-- allow re-running it. Today app/api/brain-dump/parse/route.ts takes a
-- transcript, asks the AI to split it into candidate items, and returns
-- them straight to the client -- nothing is ever written to the database,
-- so navigating away (or the AI failing) loses the dictated/typed text
-- for good. This table gives every parse attempt a durable row: the
-- transcript is written up front (before the AI call, so it survives an
-- AI failure too), and re-running re-parses that same stored text rather
-- than asking the user to retype or re-dictate it.

create table brain_dump_batches (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  created_by_person_id uuid not null references people (id) on delete cascade,
  transcript text not null,
  -- Mirrors the parse route's own response `status` values 1:1 so the
  -- route can write back exactly what it already computed, with no
  -- separate mapping to maintain. Never shown to the user raw -- the
  -- client renders a friendly label per ground rule.
  parse_status text not null default 'pending' check (parse_status in ('pending', 'ready', 'unavailable', 'error')),
  parse_message text,
  -- The AI's last parsed items for this transcript (same shape the parse
  -- route already returns to the client), kept so a past batch's outcome
  -- can be shown in history without re-calling the AI. Re-running
  -- overwrites this with the new result; it is not a per-item
  -- save/discard ledger -- saved_count below covers that at a summary
  -- level, which is all the spec item asks for.
  items jsonb not null default '[]'::jsonb,
  saved_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger brain_dump_batches_set_updated_at
  before update on brain_dump_batches
  for each row execute function set_updated_at();

create index brain_dump_batches_household_created_idx on brain_dump_batches (household_id, created_at desc);

alter table brain_dump_batches enable row level security;

-- Brain dump (like Quick Capture) has no owner/adult gate on using it --
-- any household member can dump and save. So unlike calendar_feeds
-- (a shared household resource gated to owner/adult), a batch is scoped
-- to whoever created it: any member can create their own, everyone in
-- the household can read the household's batches (a co-parent can see
-- what got captured), and only the creator or an owner/adult can
-- re-run or delete one.
create policy "household members read brain dump batches"
  on brain_dump_batches for select
  using (is_household_member(household_id));

create policy "household members create own brain dump batches"
  on brain_dump_batches for insert
  with check (
    is_household_member(household_id)
    and exists (select 1 from people p where p.id = created_by_person_id and p.user_id = auth.uid())
  );

create policy "creator or owner/adult update brain dump batches"
  on brain_dump_batches for update
  using (
    household_role(household_id) in ('owner', 'adult')
    or exists (select 1 from people p where p.id = created_by_person_id and p.user_id = auth.uid())
  );

create policy "creator or owner/adult delete brain dump batches"
  on brain_dump_batches for delete
  using (
    household_role(household_id) in ('owner', 'adult')
    or exists (select 1 from people p where p.id = created_by_person_id and p.user_id = auth.uid())
  );
