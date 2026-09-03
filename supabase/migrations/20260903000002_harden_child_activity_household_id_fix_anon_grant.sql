-- D-145 (corrective): the previous REVOKE ... FROM public had no effect
-- on anon's access, because child_activity_household_id's ACL carries an
-- explicit anon=X grant, not just the implicit PUBLIC grant (confirmed
-- via `select proacl from pg_proc where proname =
-- 'child_activity_household_id'` ->
-- {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- -- no bare `=X/postgres` PUBLIC entry at all). Revoke from anon
-- explicitly, same fix shape as D-108's own corrective migration
-- (20260831000001b_harden_security_definer_functions_fix_public_grant.sql).
revoke execute on function public.child_activity_household_id(uuid) from anon;
grant execute on function public.child_activity_household_id(uuid) to authenticated, service_role;
