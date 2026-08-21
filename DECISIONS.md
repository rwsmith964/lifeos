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
