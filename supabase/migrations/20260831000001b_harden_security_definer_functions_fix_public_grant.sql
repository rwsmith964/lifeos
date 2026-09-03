-- D-108 (corrective): the previous REVOKE ... FROM anon had no effect
-- because these functions carry Postgres' default EXECUTE-TO-PUBLIC grant
-- (proacl '=X/postgres'), which every role -- including anon -- inherits
-- regardless of a per-role revoke. Revoke from PUBLIC itself, then
-- explicitly re-grant to the roles that legitimately need it.
--
-- Backfilled into the repo: this statement was applied directly against
-- production (migration version 20260831182628) during the D-108 session
-- but the local .sql file was never committed, leaving repo/DB migration
-- history out of parity. Recovered verbatim from
-- supabase_migrations.schema_migrations.statements via the Supabase
-- connector's execute_sql tool during the D-145 cleanup pass so a fresh
-- environment replays the exact same history. Filename uses the original
-- production timestamp (with a `b` suffix, since 20260831000001 was
-- already taken locally by the first half of this same fix) to keep
-- chronological ordering honest; it is NOT re-applied by
-- `supabase migration up` against this project since Supabase tracks
-- applied migrations by version/name already present in
-- supabase_migrations.schema_migrations, not by local filename.
revoke execute on function public.accept_household_invite(uuid) from public;
revoke execute on function public.activity_household_id(uuid) from public;
revoke execute on function public.create_household_with_owner(text) from public;
revoke execute on function public.event_created_by_me(uuid) from public;
revoke execute on function public.household_member_count(uuid) from public;
revoke execute on function public.household_member_emails(uuid) from public;
revoke execute on function public.household_role(uuid) from public;
revoke execute on function public.is_household_member(uuid) from public;
revoke execute on function public.is_linked_household_member(uuid) from public;
revoke execute on function public.linked_household_ids(uuid) from public;
revoke execute on function public.person_household_write_role_ok(uuid) from public;
revoke execute on function public.person_is_in_my_household(uuid) from public;
revoke execute on function public.handle_new_auth_user() from public;

grant execute on function public.accept_household_invite(uuid) to authenticated, service_role;
grant execute on function public.activity_household_id(uuid) to authenticated, service_role;
grant execute on function public.create_household_with_owner(text) to authenticated, service_role;
grant execute on function public.event_created_by_me(uuid) to authenticated, service_role;
grant execute on function public.household_member_count(uuid) to authenticated, service_role;
grant execute on function public.household_member_emails(uuid) to authenticated, service_role;
grant execute on function public.household_role(uuid) to authenticated, service_role;
grant execute on function public.is_household_member(uuid) to authenticated, service_role;
grant execute on function public.is_linked_household_member(uuid) to authenticated, service_role;
grant execute on function public.linked_household_ids(uuid) to authenticated, service_role;
grant execute on function public.person_household_write_role_ok(uuid) to authenticated, service_role;
grant execute on function public.person_is_in_my_household(uuid) to authenticated, service_role;
-- handle_new_auth_user: trigger-only, no direct caller gets EXECUTE at all.
grant execute on function public.handle_new_auth_user() to service_role;
