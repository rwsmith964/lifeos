-- LifeOS: weekend_plans — persists weekend planner output.
--
-- Section 4.2's table list has no dedicated table for this, but Section
-- 11.3 treats 'weekend_plan' as a first-class AI feature on equal footing
-- with 'gift_suggestion' (-> gift_suggestions) and 'daily_brief' (->
-- briefs), both of which persist their output. Re-running the AI narration
-- on every Wed/Thu/Fri brief generation without persistence would be
-- wasteful and would defeat ai_usage_log's cost tracking. See D-019.

create table weekend_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  -- The Saturday this plan covers (Sat+Sun weekend block).
  for_date date not null,
  content_json jsonb not null,
  content_markdown text not null,
  generated_at timestamptz not null default now(),
  model_version text not null
);

create unique index weekend_plans_household_for_date_unique on weekend_plans (household_id, for_date);

alter table weekend_plans enable row level security;

create policy "household members read weekend plans"
  on weekend_plans for select
  using (is_household_member(household_id));

-- Row creation is done by the weekend-plan job using the service role key,
-- which bypasses RLS by design — no insert policy for regular users.
