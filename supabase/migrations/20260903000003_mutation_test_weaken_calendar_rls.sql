-- MUTATION TEST (D-148): temporarily replace the calendar_events select
-- policy with an allow-all rule to prove household-isolation.spec.ts
-- actually fails when the real RLS trust boundary regresses. This
-- migration is reverted and deleted immediately after the CI run that
-- proves the RED result -- it must never reach main.
drop policy "read own private events, household events, or linked shared events" on calendar_events;

create policy "MUTATION TEST -- allow all reads (insecure, temporary)"
  on calendar_events for select
  using (true);
