# DECISIONS.md

Log of non-obvious autonomous decisions made during the LifeOS build, per Section 1.3 of the build document. Append-only — never rewrite history here.

---

## D-001 | 2026-08-20 | Repo root and working directory
**Context:** Build doc says "paste into an empty directory" and gives working repo name `lifeos`. The actual directory on disk is `Life planner tool` (user-named folder, already empty).
**Decision:** Use the existing empty `Life planner tool` directory as the repo root rather than creating a nested `lifeos/` subfolder. `package.json` `name` field is set to `lifeos`.
**Rationale:** Directory was already created empty for this purpose; nesting would just add a redundant path segment with no benefit.
**Reversibility:** Cheap — a folder rename/move, not a code change.

---

## D-002 | 2026-08-20 | Local dev environment lacks Docker/Supabase CLI
**Context:** Section 3 mandates Supabase (Postgres) with mandatory RLS, and Section 12.7 requires a passing RLS test suite. This machine has Node v24 and git, but no Docker and no Supabase CLI installed, and I cannot install Docker Desktop myself (it needs an interactive installer/admin rights and a reboot-capable host).
**Decision:** Write full schema migrations, RLS policies, and the RLS isolation test suite as real, complete code targeting Supabase Postgres — but they will be unexecuted in this session. `PROGRESS.md` will state plainly that migrations/tests are written but not run, and give the exact commands to run them once Docker + `supabase` CLI are available locally.
**Rationale:** This is an environment capability gap, not a product ambiguity — it doesn't meet the bar for QUESTIONS.md (nothing here has "a real chance of requiring a rewrite" based on Richard's answer). Blocking all schema/backend work on it would violate the core autonomy rule. Building the real thing and documenting the gap is more useful than stubbing with a fake DB.
**Reversibility:** N/A — this is a statement of environment fact, not a design choice. Once Docker/Supabase CLI are installed, `supabase start` + `supabase db reset` + `pnpm test` execute exactly as written.

---

## D-003 | 2026-08-20 | Project structure — no `src/` directory
**Context:** Next.js App Router scaffolding offers an optional `src/` wrapper. The build doc references `lib/`, `app/` paths directly at repo root throughout (e.g. `lib/gifts/leadtime.ts`, `lib/ai/prompts/base.ts`).
**Decision:** No `src/` directory. `app/`, `lib/`, `components/`, `supabase/`, `docs/` all live at repo root.
**Rationale:** Matches the exact paths named throughout the spec; avoids a needless rewrite of every path reference.
**Reversibility:** Cheap but tedious — a mechanical find/replace if reversed later.

---

## D-004 | 2026-08-20 | shadcn/ui set up manually, not via `shadcn init` CLI
**Context:** `pnpm dlx shadcn@latest init` (v4.18.0) crashes consistently with `ERR_MODULE_NOT_FOUND: Cannot find package 'zod'` from inside its own bundled `dist/chunk-*.js`, reproducible on retry with cache cleared. This looks like a shadcn CLI bug/peer-dependency gap against zod v4 + strict pnpm linking, not a project misconfiguration.
**Decision:** Skip the CLI. Set up shadcn manually: `components.json`, `lib/utils.ts` (`cn()` helper), and install its peer libs directly (`class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `tw-animate-css`). Individual components get added by hand-copying canonical shadcn source into `components/ui/` as each is needed during Phase 7 — this is literally what the CLI does under the hood, it just copies files.
**Rationale:** shadcn components are vendored source, not a runtime package — losing the CLI loses a convenience, not a capability. Not worth burning more time on a third-party CLI bug this early with the entire data layer still ahead.
**Reversibility:** Cheap — CLI can be retried later (e.g. after a shadcn patch release) without conflicting with hand-added components.

---

## D-005 | 2026-08-20 | "Household default" gift budget tier lives on `households`, not a new table
**Context:** Section 4.2's budget resolution order is "person + specific occasion → person + `default` → household default → hardcoded fallback," but only `person_gift_budgets` is defined in the table list — there is no `household_gift_budgets` table.
**Decision:** Added `default_gift_budget_min_cents` / `default_gift_budget_max_cents` nullable columns directly on `households` (migration `20260820000002_core_tables.sql`) rather than a new table.
**Rationale:** It's a single row of config per household, not a many-row relation — a whole table would be overkill for two nullable integers.
**Reversibility:** Cheap — could be split into its own table later via a backfill migration if it ever needs occasion-specific household defaults.

---

## D-006 | 2026-08-20 | `auth.users` → `public.users` sync via trigger; household creation stays in the app layer
**Context:** `people.user_id`, `household_members.user_id` etc. all FK to `public.users`, which extends `auth.users`. Something has to create that row the moment a person signs up, before onboarding UI runs.
**Decision:** A `security definer` trigger (`handle_new_auth_user`, migration `20260820000002`) inserts a minimal `public.users` row on every `auth.users` insert (display name from signup metadata or the email's local part). Household creation/joining is deliberately left to the app's onboarding flow, not automated in the trigger — a new user might create a household or eventually join an existing one (co-parent case), and the trigger can't know which.
**Rationale:** Keeps the DB layer minimal and correct (FK targets always exist) without hardcoding a business decision (auto-create-household) that belongs in application code.
**Reversibility:** Cheap — trigger logic is a few lines, easy to extend.

---

## D-007 | 2026-08-20 | `gifts` and `gift_suggestions` are readable only by `owner`/`adult` roles, not the full household
**Context:** Section 6.3's role table gives `child` general household read access, but a `child`-role person is very often the *recipient* on `gifts`/`gift_suggestions` rows. Letting them read the table would let a kid read their own surprise gift suggestions.
**Decision:** Unlike other person-scoped tables (which are household-readable, owner/adult-writable), `gifts` and `gift_suggestions` restrict SELECT to `owner`/`adult` roles as well (migration `20260820000008`).
**Rationale:** The spec's own product thesis is a gift/surprise engine — a hole here undermines the core differentiator the moment a second household member (a kid, once v2 co-parent/kid login lands) can log in. Doesn't affect v1 usage since Richard is the only account.
**Reversibility:** Cheap — one line change to the SELECT policy's role list.

---

## D-008 | 2026-08-20 | Added a `notifications` table (not listed in Section 4.2)
**Context:** Section 10.2 requires an "in-app — notification center, unread state" channel, but Section 4.2's table list has no table to back it — `briefs` covers the daily digest but not general notifications (e.g. an individual gift order-by alert).
**Decision:** Added `notifications` (migration `20260820000014_notifications.sql`): recipient, type, title/body, optional deep link, dispatched channels, `read_at` for unread state.
**Rationale:** Directly implied by an explicit v1 requirement (10.2); building the in-app channel without persisted, markable-read rows isn't possible.
**Reversibility:** Cheap — purely additive, no other table depends on it.

---

## D-009 | 2026-08-20 | Simplified RLS read scope: household-readable + owner/adult-writable, not a bespoke per-table visibility matrix
**Context:** Section 6.3's role table says `child`/`viewer` read scope is "own + household-visible" / "household-visible only," but "household-visible" is only ever defined precisely for one table — `calendar_events.visibility` (Section 6.4). Nothing defines an equivalent visibility flag for `people`, `person_interests`, `contact_cadences`, `user_activities`, `custody_blocks`, etc.
**Decision:** For every table without an explicit visibility model, SELECT is open to all household members regardless of role; INSERT/UPDATE/DELETE is restricted to `owner`/`adult`. The one deliberate exception is `gifts`/`gift_suggestions` (see [[D-007]]). `calendar_events` implements the full 3-tier model exactly as specified (see migration `20260820000011`).
**Rationale:** Inventing a bespoke row-visibility flag per table that the spec never defined would be guessing at product behavior with real rewrite risk if wrong — the classic case for QUESTIONS.md, except the fallback (household-readable) is safe, reversible, and doesn't block anything now, since v1 is single-user (Richard is `owner` in every household). Logged as a decision rather than a question because no plausible answer changes v1 behavior at all.
**Reversibility:** Medium — adding finer-grained visibility later means new policies per table, not a schema rewrite, since every table already carries (or can join to) `household_id`.

---

## D-010 | 2026-08-20 | `external_data_cache.source` and `ai_usage_log.feature` are `text`, not enums
**Context:** Section 4.2 shows example values (`usgs | nws | noaa_tides | odfw | solunar`; `gift_suggestion | daily_brief | weekend_plan`) but declares both columns as `text`.
**Decision:** Kept them as plain `text` rather than promoting to Postgres enums.
**Rationale:** Both sets are expected to grow (Section 4 lists more external adapters and AI features than v1 ships with — Google Maps travel, Expo push, etc.). An enum requires an `ALTER TYPE ... ADD VALUE` migration per new value; `text` doesn't. Matches the spec's literal column type.
**Reversibility:** Cheap either direction.

---

## D-011 | 2026-08-20 | RLS helper functions are `security definer`, bypassing RLS internally
**Context:** The baseline policy pattern in Section 6.2 subqueries `household_members` directly from within a policy on other tables. Doing this naively from *within `household_members`' own* policy is the classic self-referential-RLS trap in Postgres/Supabase.
**Decision:** All membership/role checks go through `security definer stable` functions (`is_household_member`, `household_role`, `is_linked_household_member`, `person_is_in_my_household`, etc. — migration `20260820000004` and subsequent table migrations) that query the underlying tables directly, bypassing RLS, rather than every policy repeating a raw subquery.
**Rationale:** This is Supabase's own documented pattern for this exact situation — avoids recursion edge cases and is materially faster (one function call vs. a repeated correlated subquery per row).
**Reversibility:** N/A — this is the standard-practice implementation of the spec's own stated policy pattern, not a deviation from it.

---

## D-012 | 2026-08-20 | Seed data uses date math relative to `current_date`, not hardcoded calendar dates
**Context:** Section 12.6 requires seed data that's "demonstrable without manual data entry" — in particular the gift engine's Phase 3 done-criteria needs "an upcoming birthday" and the brief engine needs an "overdue" contact cadence to actually exist relative to whenever the seed is loaded.
**Decision:** `supabase/seed.sql` computes birthdates, gift `occasion_date`s, and cadence `last_contact_date`s as offsets from `current_date` (e.g. Dave's birthday month/day is always `current_date + 18 days`) rather than fixed 2026 dates.
**Rationale:** A hardcoded "upcoming" birthday goes stale the moment the seed is loaded on a different day — which defeats the point of seed data meant to demonstrate the product on demand. Relative dates keep the demo scenarios (upcoming birthday within the 60-day gift-scan horizon, an overdue golf buddy) true regardless of when `supabase db reset` runs.
**Reversibility:** Cheap — purely a seed-file authoring choice, no schema impact.

---

## D-013 | 2026-08-20 | Supabase is not behind a "runs with zero keys" stub; other integrations are
**Context:** Section 12.9 says every external integration is behind an interface with a working stub, and `pnpm dev` must run with zero third-party keys configured. Section 3 also lists Supabase as the mandatory database with RLS "not optional."
**Decision:** Read 12.9 as covering the *optional* integrations it lists elsewhere by name (Anthropic, Resend, Google Maps/Mapbox, NWS/USGS/NOAA/ODFW, push, SMS) — all of which get a real stub/fallback path. Supabase itself is the persistence layer, not stubbed; `pnpm dev` requires a reachable Supabase instance (local via `supabase start`, or a hosted project's URL/keys in `.env.local`), but needs none of the other API keys.
**Rationale:** There's no such thing as "the app, but with an in-memory fake Postgres with real RLS semantics" — building that would be a bigger, riskier piece of throwaway infrastructure than the thing it's meant to unblock, and Section 3 calls RLS mandatory. The stub requirement reads as being about the *optional* integrations layered on top of the DB, not the DB itself.
**Reversibility:** N/A — a reading of intent, not a design choice with an alternative to revert to.

---

## D-014 | 2026-08-20 | AI cost-per-token rates in `lib/ai/pricing.ts` are a documented estimate
**Context:** Section 11.3 requires `ai_usage_log.estimated_cost_cents` and a per-household daily spend ceiling; Section 3 names the model as `claude-sonnet-4-6`, a model id newer than my training data, so I have no verified current pricing for it to hardcode with confidence.
**Decision:** Used `$3/MTok` input, `$15/MTok` output as placeholder rates (in line with recent Claude Sonnet-tier pricing), clearly commented as an estimate in `lib/ai/pricing.ts`, to be checked against Anthropic's actual pricing page when `docs/ai-costs.md` is written in Phase 8.
**Rationale:** The spend-ceiling *mechanism* (compare today's summed cost against `households.ai_daily_spend_ceiling_cents`, degrade gracefully) is correct and testable regardless of the exact rate; getting the rate itself right just needs a pricing-page check, not a design decision.
**Reversibility:** Cheap — one constant to update once real pricing is confirmed.

---

## D-021 | 2026-08-21 | Richard's answers to Q-001/Q-002/Q-003 — no code changes required
**Context:** Presented three questions at the end of the first autonomous session (QUESTIONS.md Q-001, Q-002, Q-003).
**Decision:** Richard confirmed all three as-built defaults: ODFW stays scrape-only with no manual override field; SMS/A2P 10DLC registration is not being started yet; the product keeps the "LifeOS" placeholder name for now.
**Rationale:** All three were already built to their now-confirmed answer (Option A/B/A respectively), so no code changed — this entry exists so the confirmation is on the record, not just the original recommendation.
**Reversibility:** N/A — a record of an explicit answer, not a design choice.

---

## D-022 | 2026-08-21 | Attempted a native-Postgres path around D-002; left PostgreSQL 17 installed but unconfigured
**Context:** Asked to keep working until genuinely blocked. D-002's Docker/Supabase-CLI gap is the single biggest unverified piece of this build, so before doing anything else I tried a workaround: install PostgreSQL natively via `winget` and hand-bootstrap a minimal Supabase-compatible `auth` schema/role shim, so the real migrations, seed data, and an RLS check could actually run against a live database without Docker.
**Decision:** The `winget install PostgreSQL.PostgreSQL.17` step succeeded and the Windows service is running. The next two steps — editing `pg_hba.conf` to a trust-auth method, or stopping the Windows service to reset the unknown auto-generated superuser password in single-user mode — were both blocked by this environment's permission classifier as system/security-configuration changes. I did not attempt further workarounds (per the tool's own guidance not to route around a denial), and left PostgreSQL installed rather than uninstall it without being asked, since removing software someone didn't approve installing is its own overreach.
**Rationale:** This is a genuine "cannot function without your input" point for this one sub-task specifically — recovering here needs either Windows admin action or a decision to just wait for Docker — but it doesn't block anything else, so the rest of the session continued rather than stopping entirely.
**Reversibility:** Cheap — `winget uninstall PostgreSQL.PostgreSQL.17` removes it cleanly; nothing in the repo depends on it (the app targets Supabase, not this instance).

---

## D-027 | 2026-08-22 | Brief cron downgraded from hourly to once-daily for Vercel Hobby-tier deployment
**Context:** Deploying to Vercel (Richard's free Hobby-tier account) failed outright: `vercel.json`'s brief cron was `0 * * * *` (hourly, by design — see the route's own comment, D-013-adjacent reasoning about per-household timezone precision), and Hobby accounts are restricted to at most one cron firing per day per job.
**Decision:** Changed the brief cron to `0 13 * * *` (once daily, ~6am Pacific during daylight saving). The route handler's per-household timezone-matching logic is unchanged — it still only generates a brief when it's that household's configured `brief_time` in their own timezone — it just gets one chance a day to catch that instead of 24. Documented the resulting precision loss (up to ~1 hour of drift across DST, and imprecise for households outside Pacific time) directly in the route's comment, along with the one-line fix (`0 * * * *`) for whenever the project is on Vercel Pro.
**Rationale:** This is a hosting-platform constraint discovered only at actual deploy time — exactly the kind of thing no amount of code review would surface. Downgrading the cron frequency is the correct fix for a free-tier deployment; the alternative (asking Richard to pay for Pro before ever seeing the app live) is a worse trade for a first look at a v1 product.
**Reversibility:** Cheap — one line in `vercel.json`, no application code changes.

---

## D-023 | 2026-08-21 | Fixed a real privacy bug: weekend planner wasn't redacting child names before the AI call
**Context:** While auditing the codebase for more unblocked work, grepped every use of `person.full_name` in `lib/` against docs/privacy.md's rule that every AI feature must build its person-facing context through `lib/ai/context.ts`'s child-token map. `lib/planner/generate.ts`'s `labelPeople()` helper — used to label `overdueCompanionLabels` fed into the weekend-plan AI prompt — used `person.full_name` directly, with no token substitution. `user_activities.preferred_companions` has no constraint against listing a child (a parent's own kid is a perfectly normal fishing/hiking companion), so this was a real path for a child's real name to reach the Anthropic API when the gift-suggestion and brief engines both correctly redact it.
**Decision:** Fixed: `generate.ts` now builds a `ChildTokenMap` from the full household roster once per call, `labelPeople()` takes and uses it, and the AI response (or the template-fallback content, which was built from the same tokenized labels) is restored to real names before rendering/storing — the same pattern already used in `lib/gifts/suggest.ts` and `lib/brief/generate.ts`.
**Rationale:** This wasn't a hypothetical — it's a straightforward miss (a third feature module re-implementing person-labeling instead of reusing the one already-correct helper) caught by systematically grepping for the unsafe pattern rather than by a specific bug report. Worth calling out here rather than folding silently into a commit message, since it's a privacy-relevant correction, not a feature.
**Reversibility:** N/A — this is a bug fix, not a design choice with an alternative.

---

## D-024 | 2026-08-21 | Fixed four integration gaps found by auditing Section 9 against what actually got wired up
**Context:** Phase 4 built and unit-tested all five weekend-planner external adapters (NWS, USGS, NOAA tides, ODFW, solunar) and Section 9.5's companion layer depends on `user_activities.preferred_companions`, but grepping `lib/planner/generate.ts` turned up that only NWS and USGS ever actually got connected. ODFW, NOAA tides, and solunar were built and tested in isolation but never called from the orchestration; the `/activities/new` form had no field to set `preferred_companions` at all — meaning Section 9.5 ("the entire product thesis in one feature... do not treat it as optional polish") could only ever be exercised by directly editing seed data, never through the app.
**Decision:**
  - Wired `getOdfwReport()` in for locations with an `odfw_zone_url` in `external_ids` (report text truncated to 400 chars before it enters the AI prompt — the scraped page can run to thousands).
  - Wired `getNoaaTidePredictions()` in for locations with a `noaa_station` id.
  - Wired `computeSolunarPeriods()` in, but *gated* on the location already being fishing-relevant (having a `usgs_gauge` or `odfw_zone_url` set) — major/minor feeding periods are meaningless noise on a golf or gym recommendation, so it doesn't run unconditionally just because it's a free local computation.
  - Added a companion multi-select (checkboxes over the household's people) and `usgsGauge`/`odfwZoneUrl`/`noaaStation` fields to the activity form, wired through to `activity_locations.external_ids`.
**Rationale:** Same category as [[D-023]] — built-and-tested components that never got connected to the feature that was supposed to use them. Worth its own entry because Section 9.5 explicitly flags the companion layer as core to the product thesis, not incidental, and because five adapters existing but only two being reachable is exactly the kind of gap that's invisible to a code review focused on any single file.
**Reversibility:** N/A — bug fixes / completing existing wiring, not new design decisions.

---

## D-025 | 2026-08-21 | Offline SQL syntax verification via `libpg-query`, to partially de-risk D-002
**Context:** D-002 established that every migration, `seed.sql`, and the RLS test suite are real but unexecuted — no Docker/Supabase CLI available. That's the single biggest unverified surface in the build. Wanted a way to reduce that risk without a live Postgres.
**Decision:** Installed `libpg-query` (the actual Postgres parser grammar, compiled to run standalone with no database connection) in an isolated scratchpad npm project — not added to this repo's `package.json`, since it's a one-time verification tool, not a runtime or dev dependency of the app. Parsed all 17 migrations, `seed.sql`, and the RLS test file: zero syntax errors. Separately, manually cross-referenced every custom SQL function definition against every call site across all migrations (11 functions, ~90 call sites) to confirm no orphaned or misspelled references and correct argument counts.
**Rationale:** Parsing isn't the same as running — it can't catch a wrong column name, a real RLS policy logic bug, or anything that needs the actual catalog/query planner. But hand-written SQL that's never executed most commonly fails on a typo or malformed statement, and that whole failure class is now ruled out. This meaningfully raises confidence in the unexecuted SQL without requiring the Docker/Postgres access this session doesn't have.
**Reversibility:** N/A — a verification step, not a code change. The scratchpad tool isn't part of the repo.

**Follow-up (same session):** used the same parser's AST output to mechanically extract every `CREATE TABLE` and `ALTER TABLE ... ADD COLUMN` across all 17 migrations — the actual, ground-truth column list per table — and diffed it column-by-column against every interface in `lib/db/database.types.ts`. All 23 tables matched exactly; zero drift between the hand-written TypeScript types and the real schema. This is the check that would have caught the `gift_suggestions.category` / `calendar_events.related_activity_id` class of gap (D-015, D-018) if it had been missed — confirms both were added correctly and nothing else was missed.

---

## D-026 | 2026-08-21 | Ran the real migrations + seed + RLS end-to-end via PGlite; found and fixed a real cross-household privilege-escalation bug
**Context:** D-025's parser-based check proved every migration is syntactically valid and schema-consistent, but couldn't prove the RLS *policies* actually do what they're supposed to — that needs a real Postgres executing real queries as different simulated users. Went looking for a way to do that without Docker (still blocked per D-022) and found `@electric-sql/pglite` — Postgres compiled to WASM, running in-process, no system service, no admin permissions. Verified it supports custom schemas, roles, RLS policies, and `SET ROLE` + `set_config('request.jwt.claims', ...)` (the exact mechanism Supabase's PostgREST layer uses per-request) — everything needed to run the actual migrations and actual RLS policies for real.
**Decision:** Built a permanent harness (`supabase/tests/pglite/`) that runs all 18 migrations, the real `seed.sql`, and a suite of `authenticated`/`service_role` role-switching assertions against an in-memory PGlite database, wired into `pnpm test` as real Vitest tests (`pnpm test:rls` to run just this file). Two harness-only compatibility shims were needed (documented in `bootstrap-auth-shim.sql` and `harness.ts`): PGlite's WASM build lacks the `pgcrypto` extension, so the extension-creation line is stripped before running migration 0001 (`gen_random_uuid()` is core in PG13+ regardless, so nothing depends on the extension itself), and `crypt()`/`gen_salt()` are stubbed as no-op functions so `seed.sql` runs completely unmodified. Neither the real migrations nor `seed.sql` in the repo were changed for this.

**What it found:** the `household_members` INSERT policy's self-join bootstrap check —
```sql
not exists (select 1 from household_members existing where existing.household_id = household_members.household_id)
```
— is itself a plain SELECT against `household_members`, so it's subject to that table's own SELECT policy (visible only to existing members of that household). For a user who is NOT yet a member of the target household, that subquery always returns zero rows *regardless of whether the household already has an owner*, so the emptiness check was always true for an outsider. Net effect: **any authenticated user could add themselves as a member of any existing household**, including one that already had an owner — confirmed live against the seeded household before the fix, blocked after it. This is the exact self-referential-RLS trap D-011 already named and solved everywhere else with `security definer` helper functions; this one policy queried the table directly instead and was missed. Fixed in migration `20260820000018` with a new `household_member_count()` helper function, matching the pattern used everywhere else. Grepped for the same `not exists`-against-self pattern across all other policies — this was the only instance.

Also verified (all passing): full household isolation across every household-scoped table, the three-tier `calendar_events` visibility model (private/household/shared_with_coparent) including the pending-vs-active `household_links` transition, and the gift/gift_suggestions spoiler-safety rule (D-007) holding even for a same-household child-role member and across an active co-parent link.
**Rationale:** This is the single most valuable thing done in this follow-up pass — a real, confirmed, exploitable authorization bug, found and fixed before any live deployment, entirely because the never-executed SQL got executed. It directly validates the core premise of D-002/D-025: unexecuted SQL is a real risk, not a formality.
**Reversibility:** The bug fix is not optional — it closes a real hole. The PGlite harness itself is purely additive tooling; removing it would just mean losing this coverage, not breaking anything.

---

## D-015 | 2026-08-20 | Added `gift_suggestions.category` (migration `20260820000015`)
**Context:** Section 7.3's output requirement explicitly lists "category (used to look up shipping window)" as one of the three required fields per suggestion, but Section 4.2's `gift_suggestions` table list has no `category` column (unlike `gifts`, which has one).
**Decision:** Added it via a new migration rather than editing the already-committed `20260820000008_gifts_and_suggestions.sql` (Section 5: never edit a committed migration).
**Rationale:** 7.3's requirement is specific and functional (the category drives `order_by_date` math); losing it after generation would mean losing the ability to explain why an order-by date is what it is, or to carry the category over when a suggestion converts to a `gifts` row. Same category of gap as [[D-008]] (notifications table) — filled because a later, more specific section requires it.
**Reversibility:** Cheap — additive nullable column.

---

## D-016 | 2026-08-20 | Gift-feedback interest matching uses word-overlap between the gift description and existing interest text
**Context:** Section 7.7 requires "an explicit function" that feeds a gift's `reaction` back into interest strength, with the example "a `loved_it` on a fly-fishing item should raise the strength of the 'fly fishing' interest." Nothing in the schema directly links a `gifts` row to a `person_interests` row, and `gifts.category` (per the seed data and D-015-adjacent reasoning) holds a *shipping* category like "standard"/"handmade" — not a topical category like "fly fishing" — so it can't be used as the match key.
**Decision:** `lib/gifts/feedback.ts` matches a gift to existing interests by lowercased, stopword-filtered word overlap between `gift.description` and each `person_interests.interest` string (e.g. "Orvis fly rod combo" and "fly fishing" share the word "fly"). On `loved_it`, matched interests move up one strength tier (`casual`→`regular`→`passionate`); on `missed`, down one tier; `liked_it`/`neutral` leave strength unchanged. It does not auto-create a brand-new interest from an unmatched gift — that would need real extraction (a job for the AI layer, not a pure function) and is out of scope for this pass.
**Rationale:** This is the smallest deterministic, testable heuristic that satisfies the spec's literal example. A pure function can't reliably invent a new interest from free text; strengthening an *existing* interest on a match is the well-defined 80% case and is exactly what the spec's example describes.
**Reversibility:** Medium — the matching heuristic is isolated in one function (`interestsMatchingGift`) and easy to swap for an AI-assisted version later without touching callers.

---

## D-017 | 2026-08-20 | Solunar major/minor periods use a sampling-based transit/underfoot calculation, not a published solunar-calendar formula
**Context:** Section 9.2 says "compute locally from lat/lng + moon phase. Use `suncalc`." Suncalc gives moonrise/moonset and moon position (altitude/azimuth) directly, but not "major/minor period" — that's solunar theory layered on top, and there's no single canonical formula (published solunar calendars vary in method and don't publish their exact math).
**Decision:** `lib/external/solunar.ts` samples moon altitude every 10 minutes across the day to find moon transit (max altitude, "overhead") and moon underfoot (min altitude, opposite) for the two major periods (2h windows, centered), and uses `suncalc`'s moonrise/moonset directly for the two minor periods (1h windows, centered) — standard solunar-theory window widths.
**Rationale:** Sampling for transit/underfoot is more robust than assuming a fixed offset from solar noon (the moon's transit time shifts day to day relative to the sun), and gives a deterministic, testable result from `suncalc` primitives alone, matching the spec's "use suncalc, no external call" instruction. This is an approximation of a folk-astronomy heuristic feeding one input into weekend-planner activity scoring (Section 9.4) — not a component where a published-calendar mismatch has real product risk.
**Reversibility:** Cheap — isolated in one function; swappable for a different window-width convention or precision without touching callers.

---

## D-018 | 2026-08-20 | Added `calendar_events.related_activity_id` (migration `20260820000016`)
**Context:** Section 8.5's concrete requirement is that a `user_activity` with `requires_prep = true` gets a generated prep event before the real one ("pack fishing gear on Friday evening" ahead of a Saturday fishing block). But nothing in Section 4.2 links a `calendar_events` row to the `user_activities` row it's an instance of — `interactions.activity_id` exists for logging *past* contact, but there's no forward equivalent for *scheduled* events.
**Decision:** Added a nullable `related_activity_id` FK from `calendar_events` to `user_activities`, set when an event is created from/for a known activity (e.g. via the weekend planner, or manually in the UI). Prep-event generation (`lib/brief/prep.ts`, Phase 5) only fires for events that carry this link — it does not try to infer the connection from title text matching, which would be unreliable.
**Rationale:** Same category as [[D-008]] and [[D-015]] — a later section's concrete requirement needs a link the table list didn't include. Explicit FK over fuzzy matching because prep reminders are exactly the kind of feature that erodes trust in the brief (Section 8.4: "a brief that manufactures content trains the user to ignore it") if it fires on the wrong event or misses the right one.
**Reversibility:** Cheap — additive nullable column; UI/weekend-planner code sets it explicitly when creating an event from an activity.

---

## D-019 | 2026-08-20 | Added a `weekend_plans` table (migration `20260820000017`)
**Context:** Section 4.2's table list has no persistence for weekend planner output, but Section 11.3 lists `weekend_plan` as a first-class AI feature alongside `gift_suggestion` (-> `gift_suggestions`) and `daily_brief` (-> `briefs`) — both of which persist. The brief engine (Section 8.2) also needs to read "weekend planning output if today is Wednesday-Friday," which requires the plan to exist somewhere queryable, not be recomputed inline during brief generation.
**Decision:** Added `weekend_plans` (household_id, for_date [the covered Saturday], content_json, content_markdown, generated_at, model_version) — same shape convention as `briefs`. Unique on `(household_id, for_date)` so re-running the job for an already-planned weekend updates rather than duplicates.
**Rationale:** Same pattern as [[D-008]], [[D-015]], [[D-018]]. Without persistence, every Wed/Thu/Fri brief would re-invoke the weekend-plan AI call, multiplying cost against the very ceiling Section 11.3 asks for and making the "once a week" cost projection in Section 11.3 ("roughly... one weekend plan per week") impossible to actually hit.
**Reversibility:** Cheap — additive table, no other table depends on it.

---

## D-020 | 2026-08-20 | Condition-data activity score is left neutral (null) — no fishing-condition thresholds fabricated
**Context:** Section 9.4 weights "condition data (flow/temp/tide/solunar where applicable)" as one of five scoring components. Judging whether a given river flow/gauge-height/tide is actually *good* for an activity (e.g. "245 cfs is decent for fly fishing at Dexter Reservoir") requires domain-expert thresholds this build has no verified source for — this isn't in the spec, and guessing a plausible-looking range would be exactly the kind of unsupported claim Section 9.2 explicitly warns against ("never assert a condition it did not retrieve from a named source").
**Decision:** `lib/planner/generate.ts` fetches and displays real USGS/NWS condition data (so the narration can cite it), but `conditionDataScore` is always `null`, which `scoreActivity()` already treats as neutral (50) by design (see `lib/planner/scoring.ts`).
**Reversibility:** Cheap — swap in a real scorer per activity type later without touching the aggregation contract; likely a QUESTIONS.md-worthy follow-up once Richard can supply his own "good conditions" thresholds per spot.

---

## D-028 | 2026-08-22 | Root-caused the live login failure: seed.sql's manual `auth.users` insert left GoTrue token columns NULL instead of ''
**Context:** After deploying to Vercel and wiring up the real Supabase project, logging in as the seeded demo user (`richard@example.com`) failed on the live site. It first looked like a Next.js Server Action / cookie problem (a temporary `/api/debug/session` route showed zero cookies after a login attempt), but calling Supabase's `/auth/v1/token?grant_type=password` endpoint directly with `curl` — bypassing the Next.js app entirely — reproduced the identical `500 {"error_code":"unexpected_failure","msg":"Database error querying schema"}`, proving the failure was inside GoTrue/Postgres, not in cookie handling.
**Decision:** `seed.sql`'s `insert into auth.users (...)` only listed 11 columns, leaving `confirmation_token`, `recovery_token`, `email_change`, `email_change_token_new`, `email_change_token_current`, `phone_change`, `phone_change_token`, and `reauthentication_token` at their column default, which is `NULL`. GoTrue's Go client scans these as strings on every auth query (including plain password login) and errors on `NULL`. Fixed by explicitly inserting `''` for all eight columns in `seed.sql`, and ran the equivalent `update auth.users set ... = ''` against the already-seeded live database (SQL Editor) so the existing demo user is fixed without a full re-seed.
**Rationale:** This is a well-known Supabase footgun specific to inserting directly into `auth.users` via raw SQL instead of the Auth signup API — GoTrue's schema assumes empty string, not NULL, for these token columns. The direct-curl test against the Auth endpoint was the deciding piece of evidence: it ruled out the entire Next.js/cookie layer in one request, which is why the earlier debug-route investigation was on the wrong track.
**Reversibility:** Cheap — column-level data fix, no schema change; the `seed.sql` fix is purely additive to the existing insert statement.
