# LifeOS

A proactive AI personal assistant that knows the people in your life,
watches the world outside, and tells you what to do about both — starting
with never letting you miss a gift, and growing into a full life planner.

Product naming is undecided (see `QUESTIONS.md` Q-001); "LifeOS" is a
placeholder centralized in `lib/constants.ts`.

Built autonomously per `DECISIONS.md`, `QUESTIONS.md`, and `PROGRESS.md` —
read those for the full record of what was decided, what's still open, and
exactly what state the codebase is in.

## Stack

Next.js 16 (App Router) · TypeScript strict · Supabase (Postgres + Auth +
RLS) · Tailwind v4 · shadcn/ui (hand-added, see DECISIONS.md D-004) ·
Anthropic API (`claude-sonnet-4-6`) · Resend · pnpm · Vitest.

## Getting started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start Supabase locally

Requires [Docker](https://www.docker.com/) and the
[Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
supabase start
supabase db reset   # runs every migration in supabase/migrations/, then supabase/seed.sql
```

`supabase start` prints your local `API URL` and `anon key` — copy
`.env.example` to `.env.local` and fill those in (plus `SUPABASE_SERVICE_ROLE_KEY`,
also printed).

```bash
cp .env.example .env.local
```

### 3. Run the app

```bash
pnpm dev
```

`pnpm dev` needs a reachable Supabase instance (Section 3 makes Postgres +
RLS mandatory, not optional — see D-013) but needs **zero** other API keys.
Without `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `GOOGLE_MAPS_API_KEY`, etc.,
every one of those integrations degrades gracefully to a stub or fallback
instead of failing — see `.env.example` for exactly what each one does
without a key.

### 4. Sign up and onboard

Visit `http://localhost:3000/signup`, create an account, then follow the
onboarding flow to create your household. The seed data (`supabase/seed.sql`)
loads a full demo household independently of any account you create — to
see the app populated with the demo household (Richard's), sign in as the
seeded user instead (`richard@example.com` / `lifeos-dev-password`, from
`supabase/seed.sql`).

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Start the dev server |
| `pnpm build` | Production build |
| `pnpm test` | Run the unit test suite (Vitest) |
| `pnpm test:rls` | Just the real end-to-end RLS suite (`supabase/tests/pglite/`) — runs the actual migrations + seed data against an in-process Postgres (PGlite), no setup needed |
| `pnpm typecheck` | `next typegen` + `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm db:start` / `db:reset` | Supabase CLI passthroughs |
| `pnpm db:test` | Run the RLS pgTAP suite against a real Supabase project (`supabase/tests/database/`) — needs `supabase start` |
| `pnpm job:brief` / `job:gift-scan` / `job:weekend-plan` | Manually trigger a cron job locally (Section 10.5) |

## Architecture in one paragraph

The Person Record (`people`) is the spine (Section 2.2) — every other table
either belongs to a household directly or hangs off a person. All business
logic lives in `lib/`, organized by domain (`gifts/`, `brief/`, `planner/`,
`contact/`, `external/`, `ai/`, `notifications/`, `db/`) and kept framework-
agnostic on purpose (Section 3: callable from a cron job, an API route, or
eventually a React Native client). `app/` is thin — Server Components and
Server Actions that call into `lib/`, never the reverse. Every table has
row-level security; `lib/db/client-server.ts` (user-scoped, RLS-enforced) is
what every page and Server Action should use, and
`lib/db/client-service-role.ts` (bypasses RLS) is reserved for cron/system
code — see that file's own comment before reaching for it.

## Where to look next

- `DECISIONS.md` — every non-obvious call made while building this, with
  rationale and reversibility.
- `QUESTIONS.md` — everything that couldn't be decided without you,
  prioritized.
- `PROGRESS.md` — current state: done, stubbed, not started, exact commands
  to verify.
- `docs/privacy.md` — the child-data redaction rules for AI prompts.
- `docs/ai-costs.md` — projected per-household AI spend.
