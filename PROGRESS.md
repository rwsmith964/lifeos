# PROGRESS.md

State of the LifeOS build as of this autonomous session, per Section 1.6 and
14 of the build document. Read this first if you're picking the project up
— it tells you exactly what's real, what's stubbed, and what's missing.

## How to run it

```bash
pnpm install
supabase start          # requires Docker + the Supabase CLI — see README.md
supabase db reset        # runs every migration + supabase/seed.sql
cp .env.example .env.local   # fill in the URL/keys supabase start printed
pnpm dev
```

`pnpm dev` needs Supabase reachable but zero other API keys (see D-013).
Sign in as the seeded demo user (`richard@example.com` /
`lifeos-dev-password`) to see a fully populated household, or sign up fresh
and onboard your own.

Verification commands: `pnpm typecheck`, `pnpm lint`, `pnpm test`
(212 tests), `pnpm build` (verified passing). `pnpm test:rls` runs just the
real end-to-end RLS suite (see below) — takes about 3 seconds, no setup
required. `pnpm db:test` runs the separate pgTAP suite against a real
Supabase project (needs `supabase start`) — **written but not executed**,
see below.

## The one thing to know before anything else

**No Docker was available in this build session** (D-002), so the true
Supabase CLI flow (`supabase start` / `db reset` / `test db`) and the full
authenticated app flow through a real hosted API (sign up → onboard → see
real data in the browser) have never run. **But the schema, RLS policies,
and seed data themselves have now actually been executed and verified** —
see the next section — which was the part of that gap that mattered most.
Everything that doesn't need a database at all — 212 unit tests, the full
TypeScript build, a production `next build` — passes and was actually run.
The UI was smoke-tested live (dev server + browser) for the unauthenticated
pages (`/login`, `/signup`); protected routes were confirmed to fail with
the intended clear error rather than crash silently when Supabase isn't
configured.

## The schema and RLS have actually been run — and a real bug was found and fixed

`@electric-sql/pglite` (Postgres compiled to WASM, runs in-process, needs
no Docker/service/admin rights) made it possible to run the REAL migrations
and REAL seed data end-to-end after all. This is now a permanent part of
the test suite, not a one-off: `supabase/tests/pglite/` runs all 18
migrations, `seed.sql`, and a full RLS assertion suite (household
isolation, the calendar_events 3-tier visibility model, the co-parent link
pending→active transition, gift spoiler-safety) as real Vitest tests —
`pnpm test:rls`, or just `pnpm test`. Two harness-only compatibility shims
were needed because PGlite's WASM build lacks the `pgcrypto` extension
(documented in `supabase/tests/pglite/bootstrap-auth-shim.sql` and
`harness.ts`); neither the real migrations nor `seed.sql` were changed.

**This caught a real, exploitable RLS bug** (D-026): the `household_members`
self-join bootstrap policy checked "does this household have any members
yet" via a plain SELECT against `household_members` itself — which is
subject to that table's own RLS, so for someone who isn't a member yet, it
always looked empty. Net effect: **any authenticated user could add
themselves to any existing household**, owner or not. Confirmed live,
fixed in migration `20260820000018` with a proper `security definer`
helper (the same pattern used everywhere else per D-011), reverified
passing. This is exactly the kind of bug that a schema-only review — no
matter how careful — cannot catch, and it directly validates why D-002's
gap was worth closing rather than accepting.

**What's still genuinely unverified:** the pgTAP suite in
`supabase/tests/database/` (real Supabase-CLI parity, not just PGlite —
`pgtap` isn't available in PGlite's WASM build), and the full browser-based
auth/onboarding/data flow against a real hosted Supabase project. Both need
`supabase start`, which still needs Docker.

**A dead-end side note:** earlier in this session, installing PostgreSQL 17
natively via `winget` was attempted as a different route to the same goal,
before PGlite was found. It succeeded (the Windows service
`postgresql-x64-17` is running) but recovering the auto-generated superuser
password needs either editing `pg_hba.conf` or a service restart, both
blocked by this environment's permission classifier as system/security
changes — a genuine dead end for that specific approach. It's still
installed, unused. Uninstall with `winget uninstall PostgreSQL.PostgreSQL.17`
if unwanted, or ask and it'll be removed — left in place rather than guess.

## Phase-by-phase status

### Phase 1 — Foundation: done, and now actually run (see above)
Full schema across 23 tables (`supabase/migrations/`, 18 files), RLS on
every table, a cross-household isolation pgTAP suite for real Supabase-CLI
parity (`supabase/tests/database/`, still unexecuted) AND a real end-to-end
PGlite RLS suite (19 assertions across 9 tables) that has actually run and
passed (`supabase/tests/pglite/`, D-026), idempotent seed data (1 household,
12 people incl. 2 children, ~2yr
gift history, 4 activities+locations, a month of events, alternating
custody) — the seed data itself has now loaded successfully too.

### Phase 2 — Data layer: done
Typed repository + Zod schema per table (`lib/db/`). 91 of the original 193
unit tests are in this layer and `lib/gifts`/`lib/ai` combined (212 total
now, after the PGlite RLS suite landed — see Phase 1).

### Phase 3 — Gift intelligence engine: done
Occasion scan, order-by-date math (`lib/gifts/leadtime.ts` — the spec's own
"highest-value logic"), 4-tier budget resolution, AI suggestion generation
with retry-once-then-degrade, the reaction→interest-strength feedback loop,
retailer deep links. No purchase automation (Section 7.6, by design).

### Phase 4 — External adapters: done
NWS, USGS, NOAA tides, ODFW (scrape, not API — degrades to "no report
available" rather than guessing), solunar (local computation via suncalc),
travel (Google Maps → Mapbox → haversine fallback chain). All cached via
`external_data_cache`, all fully functional with zero API keys configured.

### Phase 5 — Brief and planner engines: done
Daily brief: full input assembly (events + custody blocks, gift reminders,
overdue cadences, weather, prep obligations, weekend-plan mention),
travel-time and prep-event derivation written back to `calendar_events`,
AI generation with a non-AI templated fallback, child-name token redaction.
Weekend planner: open-block finding, the deterministic weighted scoring
function (weights in `lib/planner/weights.ts`, not the prompt), the
companion layer (Section 9.5 — cross-references overdue contacts), AI
narration with a templated fallback. Condition-data scoring is
intentionally left neutral rather than fabricating fishing-condition
thresholds (D-020) — flagged as a good target for a future QUESTIONS.md
item once real domain thresholds are available.

### Phase 6 — Notifications: done
Channel-agnostic dispatcher, in-app (real), email via Resend (real, stubs
to console without a key), push and SMS as genuine no-op stubs matching the
same interface (Sections 10.3/10.4 — intentionally not built further; SMS
timing is Q-003). Cron routes for brief/gift-scan/weekend-plan, `CRON_SECRET`
protected, plus `pnpm job:*` scripts for local manual triggering.

### Phase 7 — UI: done — see the remaining gap below
Auth (password + magic link), onboarding, the mobile-first app shell with
bottom nav, and six screens: brief (renders the AI's structured content
into cards), people list + detail + "add person," gifts (suggestion list
with save/dismiss), calendar (14-day agenda list, not a month grid — see
that page's own comment for why — plus a "this weekend" card that renders
the weekend planner's own output and can generate one on demand),
activities (feeds the weekend planner's scoring), notifications (the
Section 10.2 "in-app notification center, unread state" — a header bell
with unread badge, mark-read/mark-all-read), settings (household budget
defaults, brief time, timezone). A
fresh signup can now build out a real household entirely through the UI:
add people, add interests/budgets/gift history/contact cadence per person
(all on the person detail screen), add activities with a location, add
calendar events. This closes what was originally a gap noted after the
first UI pass (person detail was read-only) — see the commit history if
you want the before/after.

**Update:** person editing (`/people/[id]/edit`), an archive-person action,
a custody-block form (`/calendar/custody/new`), and delete actions for
interests, budgets, gifts, calendar events, and custody blocks were all
added after the first UI pass too — every table the app touches now has a
real create AND delete path through the UI, and person records also
support edit. What's still genuinely not built: no *edit* (only
add/delete) for interests, budgets, gifts, activities, or calendar events
— re-adding is the workaround for now. Low remaining risk given how small
those forms are.

### Phase 8 — Polish and documentation: done
This file, `README.md`, `docs/privacy.md`, `docs/ai-costs.md`,
`DECISIONS.md` (26 entries), `QUESTIONS.md` (3 entries, all resolved,
deduplicated, sorted by priority).

## Test coverage snapshot

212 passing tests across 27 files. Everything in Section 12.7's explicit
list is covered: lead-time math, activity scoring, cadence-overdue
calculation, travel-time fallback, and RLS policies — the last of those
now genuinely executed and passing (D-026), not just written. Coverage
skews toward pure logic (leadtime, occasions, budget, scoring, cadence,
prep/travel derivation, child-token redaction, JSON parsing) since that's
where a bug is both most likely and most costly; orchestration/wiring code
(the `generate.ts` files, cron routes) is real and typechecked but has no
dedicated unit tests — it composes already-tested pieces and would mostly
need integration-style tests against a live Supabase instance to test
meaningfully.

## Immediate next steps, in priority order

1. `supabase start && supabase db reset && pnpm db:test` once Docker is
   available — the pgTAP suite is the remaining real-Supabase-CLI-parity
   check the PGlite harness can't provide (extensions PGlite doesn't have,
   true PostgREST behavior, the full auth flow through a real hosted API).
2. Run `pnpm job:gift-scan`, `pnpm job:brief`, `pnpm job:weekend-plan`
   against a real Supabase-backed seeded household and read the output —
   the fastest way to see whether the AI-generated content is actually
   good, which no amount of unit testing can tell you.
3. `QUESTIONS.md` is fully resolved as of 2026-08-21 (see D-021) — nothing
   currently blocked on Richard's input.
4. Edit/delete actions for interests, budgets, gifts, activities, and
   calendar events (currently add-only) — the smaller item noted in the
   Phase 7 gap above.
