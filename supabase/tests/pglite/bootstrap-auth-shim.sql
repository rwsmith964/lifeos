-- Minimal Supabase-compatible shim for running the REAL LifeOS migrations
-- and seed data against PGlite (an in-process WASM Postgres) with no
-- Docker and no Supabase CLI required. Real Supabase provides all of this
-- out of the box as platform infrastructure — it is replicated here only
-- so `lib/db/../rls.test.ts` (or `pnpm test`) can exercise the actual
-- schema and RLS policies end to end without a live Supabase project.
--
-- This file is NOT run against a real Supabase project and never should
-- be — `supabase db reset` against the real CLI needs none of this.

create schema if not exists auth;

create table auth.users (
  id uuid primary key,
  instance_id uuid,
  aud text,
  role text,
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  raw_app_meta_data jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb
);

-- Supabase's auth.uid(): reads the 'sub' claim from the request.jwt.claims
-- GUC that PostgREST sets per-request based on the caller's JWT. Tests
-- simulate a request by calling set_config('request.jwt.claims', ...).
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid
$$;

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant select, insert, update, delete on auth.users to service_role;
grant select on auth.users to anon, authenticated;

-- Real Supabase grants broad table/sequence/function access to these roles
-- by default and relies on RLS to actually restrict rows — replicate that
-- via default privileges so every table/function the migrations create
-- afterward is automatically reachable (still gated by RLS policies).
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

-- PGlite's WASM build doesn't include the pgcrypto extension (real
-- Supabase Postgres always has it). Two things in the real SQL depend on
-- it:
--   1. `create extension if not exists "pgcrypto";` in migration 0001 —
--      the test runner strips that one line before executing the
--      migration text (gen_random_uuid() is core in PG13+ regardless, so
--      nothing else in the schema actually needs the extension).
--   2. seed.sql's crypt()/gen_salt() calls, used to hash the demo user's
--      password. Rather than patch seed.sql's text (fragile — breaks
--      silently if the seed file changes), stub both functions here so
--      seed.sql runs completely unmodified.
create or replace function crypt(text, text) returns text language sql immutable as $$
  select 'pglite-harness-stub-hash:' || $1
$$;
create or replace function gen_salt(text) returns text language sql immutable as $$
  select 'pglite-harness-stub-salt'
$$;
