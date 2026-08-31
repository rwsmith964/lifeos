-- D-108: brute-force / credential-stuffing protection for password
-- sign-in. Supabase Auth's own /auth/v1/token rate limit is IP-address
-- based only -- 1,800 requests/hour with bursts up to 30, not customizable
-- (https://supabase.com/docs/guides/auth/rate-limits) -- and has no
-- documented per-account lockout. An attacker who either rotates IPs or
-- simply stays under that generic quota can still throw a large number of
-- password guesses at one known email address per day. This table backs a
-- simple per-email failed-attempt lockout enforced in app/actions.ts.
create table public.auth_login_attempts (
  id bigint generated always as identity primary key,
  email_key text not null, -- lower(trim(email)); never the raw, case-sensitive user input
  attempted_at timestamptz not null default now()
);

create index auth_login_attempts_email_key_idx
  on public.auth_login_attempts (email_key, attempted_at);

alter table public.auth_login_attempts enable row level security;
-- Intentionally zero grants/policies for anon or authenticated: this is a
-- pre-auth system security control, not user-facing data, and must not be
-- readable/writable by request-time user sessions (an attacker who could
-- read or clear it could defeat the lockout, or fish for which emails
-- have accounts). Only the server-only service-role client
-- (lib/db/client-service-role.ts) ever touches this table.
revoke all on public.auth_login_attempts from anon, authenticated;
