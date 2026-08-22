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

### Phase 7 — UI: mostly done — see the gap below
Auth (password + magic link), onboarding, the mobile-first app shell with
bottom nav, and five screens: brief (renders the AI's structured content
into cards), people list + detail + "add person," gifts (suggestion list
with save/dismiss), calendar (14-day agenda list, not a month grid — see
that page's own comment for why), settings (household budget defaults,
brief time, timezone).

**Gap:** the person detail screen is read-only for interests, gift budgets,
gift history, and contact cadence — there's no UI to *add or edit* an
interest, a budget, a gift, an activity, a calendar event, or a custody
block. Everything the UI can't create yet is fully supported by the
repository/Zod layer underneath (`lib/db/repositories/*.ts`,
`lib/db/schemas.ts`) — it's specifically the form screens that ran out of
session time, not the data layer. The seeded demo household is the only
way to see these populated right now; a fresh signup gets a household with
just yourself in it and no way yet to add anyone else's interests, gifts,
or activities beyond the bare person record. This is the single biggest
thing to build next if picking this project back up.

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
2. Build the missing create/edit forms (interests, budgets, activities +
   locations, manual calendar events, custody blocks) — the Phase 7 gap
   above.
3. Work through `QUESTIONS.md`, highest priority first.
4. Run `pnpm job:gift-scan`, `pnpm job:brief`, `pnpm job:weekend-plan`
   against the seeded household and read the output — the fastest way to
   see whether the AI-generated content is actually good, which no amount
   of unit testing can tell you.
