-- D-108: security hardening from a Supabase security-advisor scan.
--
-- 1) Lock down mutable search_path on two SECURITY INVOKER trigger
--    functions (function_search_path_mutable WARN) so they match the
--    `SET search_path TO 'public'` convention already used by every other
--    function in this schema. A mutable search_path on a function that
--    runs with elevated/ambient privilege is a known privilege-escalation
--    vector (a caller with schema-create rights could shadow an unqualified
--    identifier); explicitly pinning it removes the ambiguity.
alter function public.set_updated_at() set search_path to 'public';
alter function public.sync_contact_cadence_from_interaction() set search_path to 'public';

-- 2) Revoke the PUBLIC EXECUTE grant (Postgres' default for every new
--    function) from SECURITY DEFINER helper functions that either require
--    an authenticated caller (they raise/return nothing when auth.uid() is
--    null) or are internal RLS helpers with no legitimate logged-out
--    caller. A per-role `REVOKE ... FROM anon` alone is not enough here:
--    each of these functions' ACL was only the implicit PUBLIC grant
--    (`=X/postgres`), which every role -- including anon -- inherits
--    regardless of a specific per-role revoke. `authenticated` keeps
--    EXECUTE because RLS policies evaluated for logged-in users depend on
--    these at query time, and the app calls several of them directly
--    post-login (create_household_with_owner, accept_household_invite,
--    household_member_emails). `service_role` keeps EXECUTE for parity
--    with cron/system jobs that use the service-role client.
--
--    Left untouched (intentionally anon-executable, token-gated, no
--    session/membership required by design -- these back the emailed
--    invite-link and childcare-request-link flows for logged-out
--    recipients):
--      get_household_invite_preview, get_childcare_request_preview,
--      respond_to_childcare_request
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

-- 3) handle_new_auth_user is an `auth.users` INSERT trigger function only.
--    It has no legitimate direct-RPC caller at all: Postgres invokes
--    trigger functions via the trigger mechanism itself, not through a
--    role's EXECUTE grant on the function, so revoking EXECUTE from every
--    querying role does not affect signup. service_role keeps EXECUTE for
--    parity/back-compat; no interactive role gets it.
revoke execute on function public.handle_new_auth_user() from public;
grant execute on function public.handle_new_auth_user() to service_role;
