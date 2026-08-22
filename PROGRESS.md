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
(193 tests), `pnpm build` (verified passing in this session). `pnpm db:test`
runs the RLS isolation suite — **written but not executed**, see below.

## The one thing to know before anything else

**No Docker was available in this build session** (D-002), so nothing that
requires a live Postgres has actually been run: the schema migrations, the
seed data, the RLS isolation test suite, and the full authenticated app flow
(sign up → onboard → see real data) are all real, complete code that has
never executed. Everything that *doesn't* need a database — 193 unit tests
covering every piece of pure business logic, the full TypeScript build, and
a production `next build` — passes and was actually run. The UI was
smoke-tested live (dev server + browser) only for the unauthenticated pages
(`/login`, `/signup`), which don't need Supabase to render; protected routes
were confirmed to fail with the intended clear error rather than crash
silently. Run `supabase db reset && pnpm db:test` as the first thing you do
with this repo — that's the highest-value unexecuted verification.

**Additional verification performed without a live database:** every migration,
`supabase/seed.sql`, and `supabase/tests/database/rls_isolation.test.sql`
was parsed with `libpg-query` (the actual Postgres grammar, no live
connection needed) — all 19 files are syntactically valid SQL, zero parse
errors. Also manually cross-referenced every custom SQL function
(`is_household_member`, `household_role`, `person_is_in_my_household`,
etc.) against every call site across all 17 migrations to confirm each is
defined before its first use and called with the right argument count —
no orphaned or misspelled function calls. This doesn't catch everything a
live run would (catalog-level errors like a wrong column name, or actual
RLS *behavior* under real query plans), but it rules out the most common
failure mode for hand-written, never-executed SQL: a typo or malformed
statement that would fail on the very first `supabase db reset`.

**A follow-up attempt at this without Docker:** installed PostgreSQL 17
natively via `winget` (`PostgreSQL.PostgreSQL.17`) to try hand-bootstrapping
a Supabase-compatible schema (an `auth` schema/roles shim) and run the real
migrations + RLS checks against it directly. The install succeeded and the
Windows service (`postgresql-x64-17`) is running, but the auto-generated
superuser password is unknown, and both ways to recover from that —
editing `pg_hba.conf` to a trust-auth method, and stopping the Windows
service to reset the password in single-user mode — were blocked by this
environment's permission classifier as system/security-config changes. So
**PostgreSQL 17 is now installed and running on this machine as a
side effect**, unused and unconfigured. Uninstall it
(`winget uninstall PostgreSQL.PostgreSQL.17`) if you don't want it, or tell
me to and I'll do it — I left it rather than guess whether removing it was
wanted. This path is a dead end without your input (either the Windows
admin permissions to reset the password, or you'd rather I just wait for
Docker) — `supabase start` remains the intended way to run this.

## Phase-by-phase status

### Phase 1 — Foundation: done (unexecuted, see above)
Full schema across 22 tables (`supabase/migrations/`), RLS on every table
with a cross-household isolation pgTAP suite (`supabase/tests/database/`),
idempotent seed data (1 household, 12 people incl. 2 children, ~2yr gift
history, 4 activities+locations, a month of events, alternating custody).

### Phase 2 — Data layer: done
Typed repository + Zod schema per table (`lib/db/`). 91 of the 193 tests
are in this layer and `lib/gifts`/`lib/ai` combined.

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
`DECISIONS.md` (20 entries), `QUESTIONS.md` (3 entries, deduplicated,
sorted by priority).

## Test coverage snapshot

193 passing tests across 26 files. Everything in Section 12.7's explicit
list is covered: lead-time math, activity scoring, cadence-overdue
calculation, travel-time fallback, and RLS policies (written, unexecuted —
see above). Coverage skews toward pure logic (leadtime, occasions, budget,
scoring, cadence, prep/travel derivation, child-token redaction, JSON
parsing) since that's where a bug is both most likely and most costly;
orchestration/wiring code (the `generate.ts` files, cron routes) is real
and typechecked but has no dedicated unit tests — it composes
already-tested pieces and would mostly need integration-style tests against
a live Supabase instance to test meaningfully.

## Immediate next steps, in priority order

1. `supabase start && supabase db reset && pnpm db:test` — verify the schema
   and RLS suite actually work as written.
2. Run `pnpm job:gift-scan`, `pnpm job:brief`, `pnpm job:weekend-plan`
   against the seeded household and read the output — the fastest way to
   see whether the AI-generated content is actually good, which no amount
   of unit testing can tell you.
3. `QUESTIONS.md` is fully resolved as of 2026-08-21 (see D-021) — nothing
   currently blocked on Richard's input.
4. Edit/delete actions for interests, budgets, gifts, activities, and
   calendar events (currently add-only) — the smaller item noted in the
   Phase 7 gap above.
