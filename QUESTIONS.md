# QUESTIONS.md

Questions that genuinely cannot be decided without Richard's input, per Section 1.4. Sorted by priority (HIGH, then MEDIUM, then LOW) within each pass. Deduplicated.

---

## Build Brief Queue (QUEUE-###)

Entries below use the format mandated by the "Build Brief — Competitive Parity + Moat Extension"
(§7): sequential `QUEUE-###` numbering, never reused, logged instead of stopping to ask. The
pre-existing `Q-XXX` sections below (from the prior autonomous engagement) are untouched — this is
a new section, not a reformat of the old one. `Blocking: Yes` entries get a matching
`TODO(QUEUE-###)` marker in code.

### QUEUE-001
**Module:** Phase 0 / process
**File(s):** `QUESTIONS.md`, `FEATURES.md`
**Question:** The repo already has a `QUESTIONS.md` using a `Q-XXX` format (Q-001–Q-006, three
still open) from a prior autonomous engagement. The new build brief mandates a different
`QUEUE-###` format. Overwrite the old file, or reconcile?
**Assumption made:** Append a new `## Build Brief Queue (QUEUE-###)` section to the existing file
rather than overwriting it — the old Q-XXX entries are still live, unresolved product questions
for Richard and must not be lost. New entries from this engagement use `QUEUE-###` exclusively.
**Reversal cost:** Low
**Blocking:** No

### QUEUE-002
**Module:** Module 1 / Relationship & Gift Engine
**File(s):** `app/(app)/people/[id]/`, `lib/db/repositories/relationship-gift-engine.ts`
**Question:** Module 1's backend (6 new tables + gift pipeline stages, all flagged off) is done,
tested, and merged, but no person-detail-page UI surfaces any of it yet (profile details,
wishlist, relationships, conversation log, moments, reciprocity ledger). Build the UI now before
moving to Module 2, or keep going module-by-module on backends first and build UI for everything
in a later pass?
**Assumption made:** Keep moving — build Module 2's backend next per the brief's "never idle"
mandate, since backend-first with the flag OFF is fully compliant with the additive contract
(zero effect on the live app either way). UI for Module 1 (and any other module built
backend-first) is tracked as a follow-up in BUILD-REPORT.md rather than blocking progress through
the remaining modules.
**Reversal cost:** Low
**Blocking:** No

### QUEUE-003
**Module:** Module 2 / Leisure Planner
**File(s):** `app/(app)/activities/leisure-planner-actions.ts`, `lib/planner/score-breakdown-display.ts`, `lib/planner/gear-checklist.ts`
**Question:** Same shape as QUEUE-002 — Module 2's backend (3 new tables + `opportunities.score_breakdown`, all flagged off) is done, tested, and merged, but no UI surfaces the viability config manager, gear checklist manager, outing log form, or opportunities breakdown display yet.
**Assumption made:** Keep moving to Module 3 per the brief's "never idle" mandate — backend-first with the flag OFF is fully compliant with the additive contract. UI for Module 2 (alongside Module 1's) is tracked as a follow-up in BUILD-REPORT.md rather than blocking progress.
**Reversal cost:** Low
**Blocking:** No

### QUEUE-004
**Module:** Module 2 / Leisure Planner
**File(s):** `lib/opportunities/detect.ts`, `lib/planner/score-breakdown-display.ts`
**Question:** `detect.ts` is an orchestration function (forecast fetch + day-scan loop + DB writes) with zero existing test coverage; the brief calls for characterization tests before touching code like this, but a true characterization test would require mocking the weather/forecast provider and the full day-scan loop, a much larger undertaking than the actual change (adding a `score_breakdown` argument to two existing `create()` calls).
**Assumption made:** Extract the flag-gated decision of what to persist into a separately-defined, fully unit-tested pure function (`resolveOpportunityScoreBreakdown()`), and edit `detect.ts` only to call it — the minimal-diff edit to the orchestrator is a one-line-per-call-site substitution, and the actual decision logic being tested is exactly the same regardless of which function contains it. Treated as a pragmatic substitute for full characterization tests on `detect.ts` itself, not a substitute for testing the logic at all.
**Reversal cost:** Low
**Blocking:** No

### QUEUE-005
**Module:** Module 2 / Leisure Planner
**File(s):** `lib/planner/generate.ts`
**Question:** The weekend-plan narrative generator (`lib/planner/generate.ts`, an AI-prompt surface) could also show a score breakdown alongside its narrative text, matching what Module 2 now does for `opportunities`.
**Assumption made:** Leave `generate.ts` untouched this pass. It is a higher-risk AI-prompt surface than `detect.ts`, and the brief's "don't refactor working code beyond what's needed" plus "one module per branch, merge only when green" argue against expanding Module 2's scope into a second file with its own testing burden. Deferred to a future pass.
**Reversal cost:** Low
**Blocking:** No

### QUEUE-006
**Module:** Module 2 / Leisure Planner
**File(s):** `lib/planner/generate.ts`, `activity_type_viability_configs`
**Question:** Should the new `activity_type_viability_configs` table actually be wired into the existing `isFishingRelevantLocation` gate in `generate.ts`, so a household's declared viability inputs affect real scoring/gating rather than being a purely declarative, unread table?
**Assumption made:** No — v1 ships `activity_type_viability_configs` as declarative-only (a household can record and later view which inputs matter for an activity type), and the existing gate in `generate.ts` is left completely untouched, per the standing rule not to refactor existing working code. Wiring it into live gating is a larger, separate change with its own risk profile (a misconfigured household could accidentally suppress real opportunities) and is deferred to a future pass, likely alongside QUEUE-005.
**Reversal cost:** Medium
**Blocking:** No

### QUEUE-007
**Module:** Module 3 / Universal Intake + Trust Layer
**File(s):** `lib/flags.ts`
**Question:** The brief's acceptance criteria refer to two separate flags by name — "with `intake` off" and "with `trust_log` off" — implying intake ingestion and the trust/action-log wrapper could be toggled independently.
**Assumption made:** Ship both halves behind a single flag, `universal_intake_v2`, matching the module-per-flag pattern every other module in this engagement uses (`relationship_gift_engine_v2`, `leisure_planner_v2`, etc.) and consistent with the brief's own opening line that intake and trust "ship together" because "intake without confidence scoring imports the exact failure mode damaging Ohai's reviews." Splitting them would let a household run intake with the trust/undo layer switched off, which the brief itself says not to do. Both acceptance criteria are still individually true under one flag: OFF means no ingestion routes AND unchanged mutation functions.
**Reversal cost:** Low
**Blocking:** No

### QUEUE-008
**Module:** Module 3 / Universal Intake + Trust Layer
**File(s):** `app/api/intake/route.ts`
**Question:** The brief's acceptance line is "with `intake` off, no ingestion routes exist." In a deployed Next.js app the route file itself always exists once built; a flag can only change what it does at request time, not remove it from the build.
**Assumption made:** Interpreted as "returns 404 and performs zero ingestion work" when `universal_intake_v2` is off — the closest behavioral proxy achievable without a build-time route-stripping step, which would be a much larger, higher-risk change to the build pipeline for no additive benefit. No parsing, no AI calls, no draft writes happen on the off path.
**Reversal cost:** Low
**Blocking:** No

### QUEUE-009
**Module:** Module 3 / Universal Intake + Trust Layer
**File(s):** `lib/intake/convert.ts`, `app/api/intake/route.ts`
**Question:** The brief says drafts "can create events, tasks, people, gift ideas, or moments," but there is no `tasks` table anywhere in the schema (confirmed via grep across `supabase/migrations/` and `lib/db/database.types.ts` — the app has never had a general task/to-do concept, only calendar events, gifts, people, and moments).
**Assumption made:** A detected type of `task` is always routed to the review queue as `needs_review` and is never auto-converted by `convertDraftToRecord` (see `NON_CONVERTIBLE_TYPES` in `lib/intake/convert.ts`). The draft's extracted fields are preserved and visible for a human to redirect (e.g. into a calendar event or moment) once the review-queue UI ships (see QUEUE-011). No task table was invented to satisfy the brief's list, since adding one would be a much larger, unscoped schema decision belonging to a different module, if any.
**Reversal cost:** Medium — adding a real tasks table later is additive (new table), but every existing "task"-typed draft in the drafts table would need a one-time backfill/reclassification pass.
**Blocking:** No

### QUEUE-010
**Module:** Module 3 / Universal Intake + Trust Layer
**File(s):** `lib/intake/confidence.ts`, `supabase/migrations/20260901000004_module3_intake_trust_layer.sql`
**Question:** The brief says the review-queue confidence threshold is "configurable, default conservative," implying a per-household setting a user can adjust.
**Assumption made:** Shipped the conservative default (`DEFAULT_CONFIDENCE_THRESHOLD = 0.75`) and the `getReviewThreshold()` function already accepts an optional per-household override, but no `feature_flags`-adjacent household-settings column was added to actually store one yet, since no settings UI exists to set it and adding an unused nullable column with no writer felt premature. `getReviewThreshold()` always falls back to 0.75 today. Adding the storage column (a new nullable column on an existing table, or a new small table) plus a Settings toggle is a small additive follow-up once the review-queue UI (QUEUE-011) is built.
**Reversal cost:** Low
**Blocking:** No

### QUEUE-011
**Module:** Module 3 / Universal Intake + Trust Layer
**File(s):** `lib/intake/review-queue.ts`, `lib/trust/weekly-digest.ts`, `app/(app)/`
**Question:** Same shape as QUEUE-002/QUEUE-003 — Module 3's backend (drafts table, action log, review-queue approve/reject/correct functions, verified-completion wiring into Quick Capture, weekly digest builder) is done, tested, and merged, but no page/UI surfaces the review queue, the action log/undo, or the weekly digest yet.
**Assumption made:** Keep moving to Module 4 per the brief's "never idle" mandate — backend-first with the flag OFF is fully compliant with the additive contract (zero effect on the live app either way). UI for Modules 1, 2, and 3 is tracked together as a follow-up in BUILD-REPORT.md rather than blocking progress through the remaining modules.
**Reversal cost:** Low
**Blocking:** No

### QUEUE-012
**Module:** Module 3 / Universal Intake + Trust Layer
**File(s):** `supabase/migrations/20260901000004_module3_intake_trust_layer.sql`, `lib/intake/parse.ts`
**Question:** The brief says every draft carries "the source artifact (thumbnail or excerpt)." Persisting actual image/PDF bytes (a thumbnail) would need a Storage bucket, upload wiring, and RLS policy for that bucket — a materially larger piece of new infrastructure than the drafts table itself.
**Assumption made:** Store a short text excerpt only (`source_excerpt` column, truncated) for every source type including image/screenshot/PDF, never raw bytes or a generated thumbnail image. The excerpt is the OCR/extraction text already produced while parsing, so it costs nothing extra to capture. A Storage-bucket-backed thumbnail is a reasonable future enhancement but out of scope for this pass.
**Reversal cost:** Low — adding thumbnail storage later is additive (new nullable column pointing at a Storage path).
**Blocking:** No

### QUEUE-013
**Module:** Module 3 / Universal Intake + Trust Layer
**File(s):** `app/api/intake/route.ts`, `lib/intake/parse.ts`
**Question:** The brief lists "forwarded email" as one of the six intake source types. Actually receiving a forwarded email requires an inbound-mail webhook (e.g. a provider like Resend/Postmark/SendGrid inbound parse) wired to a real MX/DNS record on a domain LifeOS controls — infrastructure outside this sandbox and already blocked by the same unverified-domain issue tracked in the project's transactional-email-delivery notes.
**Assumption made:** The `/api/intake` endpoint accepts `sourceType: "email"` and parses already-extracted email text/subject/from fields via `parseEmailSource()` — so the parsing and confidence-scoring logic is fully built and tested — but no inbound webhook or DNS/mail-provider configuration was set up to actually deliver a real forwarded email to that endpoint. Wiring the transport is a follow-up once the domain-verification blocker is resolved.
**Reversal cost:** Low
**Blocking:** No

### QUEUE-014
**Module:** Module 3 / Universal Intake + Trust Layer
**File(s):** `lib/intake/review-queue.ts`
**Question:** When a draft's detected person doesn't exactly match an existing `people` row (e.g. a nickname or misspelling extracted from a flyer), should the review queue attempt fuzzy name matching and suggest candidates, or always require a human to pick the person explicitly?
**Assumption made:** No fuzzy matching built yet — `approveDraft()` accepts an optional explicit `resolvedPersonId` parameter and otherwise uses whatever person reference the draft extraction produced as-is. Fuzzy suggestion is a UI-layer concern that belongs with the review-queue screen itself (QUEUE-011), so it's deferred alongside that UI rather than half-built into the backend function now.
**Reversal cost:** Low
**Blocking:** No

### QUEUE-015
**Module:** Module 4 / Scheduling Intelligence
**File(s):** `lib/calendar/caldav.ts`, `supabase/migrations/*_module4_scheduling_intelligence.sql`
**Question:** The brief asks for two-way sync with Google, Apple, and Outlook "to match Ohai's current bar." Genuine OAuth-based write-back to Google Calendar (and full Outlook/Microsoft Graph OAuth) requires registering an OAuth application in Google Cloud Console / Azure AD under Richard's own developer account, configuring a consent screen, and — for Google specifically — passing Google's app-verification review before it can write to any calendar outside a small test-user allowlist. None of that can be done from inside this sandbox; it requires Richard's own cloud console access and, for Google, a review process that takes real-world days to weeks and is outside anyone's direct control.
**Assumption made:** Built genuine two-way sync using the CalDAV protocol instead, which needs no OAuth app: Apple iCloud and Outlook.com/Office 365 both expose standards-compliant CalDAV endpoints that work with a per-account app-specific password (exactly the same "paste in your own credential" pattern the existing one-way ICS import already uses for the feed URL). This gets real two-way sync working for two of the three named providers today. Google Calendar retired public CalDAV for consumer accounts, so Google is wired as a selectable-but-disabled provider option in the schema and UI (same "interface ready, implementation deferred" pattern already used for the `push`/`sms` notification channels) — it activates the moment `GOOGLE_CALENDAR_CLIENT_ID`/`GOOGLE_CALENDAR_CLIENT_SECRET` are configured, with no further schema changes.
**Reversal cost:** Low — adding real Google OAuth later is additive (new adapter behind the same `CalendarSyncAdapter` interface, new env vars); nothing about the CalDAV path needs to change.
**Blocking:** Yes — flagged with `TODO(QUEUE-015)` at the Google provider branch in `lib/calendar/sync-providers.ts`. Full three-provider parity needs Richard to register the Google OAuth app himself.
**Resolution note (Sept 2 2026):** Still on hold, no code change — Google remains the selectable-but-disabled provider option described above. Nothing in this sandbox can substitute for Richard registering the OAuth app in Google Cloud Console and clearing Google's app-verification review himself, so this stays deferred until he does that and provides `GOOGLE_CALENDAR_CLIENT_ID`/`GOOGLE_CALENDAR_CLIENT_SECRET`.

### QUEUE-016
**Module:** Module 4 / Scheduling Intelligence
**File(s):** `lib/security/encryption.ts`, `supabase/migrations/*_module4_scheduling_intelligence.sql`
**Question:** CalDAV app-specific passwords are real, reusable credentials to a person's personal calendar account — meaningfully more sensitive than the existing plaintext `calendar_feeds.feed_url` (a random unguessable secret URL, but not a password tied to their Apple/Microsoft account login). The brief's standing directive asks for "good cybersecurity implementations."
**Assumption made:** Added application-level AES-256-GCM encryption (`lib/security/encryption.ts`) for the app-password column specifically, keyed by a new `CALDAV_ENCRYPTION_KEY` env var — the password is never stored in plaintext, only ciphertext + nonce + auth tag. If the env var isn't configured, CalDAV account creation is refused with a clear error (same "no key configured, no unsafe fallback" posture as requiring `RESEND_API_KEY` for real email) rather than silently storing the secret unencrypted. `.env.example` documents the new var. This does not touch the existing `calendar_feeds.feed_url` column/pattern, since changing that is outside Module 4's scope and would be a refactor of shipped code the brief prohibits.
**Reversal cost:** Low — purely additive; rotating to a KMS-backed key or Supabase Vault later doesn't change the call sites, just the key source.
**Blocking:** No

### QUEUE-017
**Module:** Module 4 / Scheduling Intelligence
**File(s):** `lib/calendar/two-way-sync.ts`
**Question:** For the push (LifeOS -> CalDAV) direction of two-way sync, should an already-pushed local event be re-pushed every time it's edited after the initial sync, to keep the remote copy current?
**Assumption made:** v1 pushes each local event to its CalDAV account exactly once, on the first sync after it becomes eligible (`synced_to_account_id IS NULL`). Once `pushToSyncAccount` records a `synced_to_account_id`/`external_caldav_href`/`external_caldav_etag` on the row, later edits to that event are NOT re-pushed — the remote copy reflects the event's state as of first sync only. This keeps v1 conflict-free (no need to reconcile a local edit against a possibly-also-edited remote ETag) at the cost of remote copies going stale after a local edit. Chosen because the brief explicitly calls out auto-reconciliation/auto-rescheduling as the fastest way to lose trust, and a correct edit-reconciliation policy (last-write-wins? merge? surface a conflict?) is exactly that kind of judgment call the brief says not to make silently.
**Reversal cost:** Medium — re-enabling continuous push-on-edit means clearing `synced_to_account_id` (or adding a `synced_at`/content-hash column) whenever a pushed event is edited, plus a real ETag-conflict policy for the case where the remote copy also changed; additive (new nullable column or two), but touches `pushToSyncAccount`'s selection query and needs product input on the conflict policy.
**Blocking:** No

### QUEUE-018
**Module:** Module 4 / Scheduling Intelligence
**File(s):** `lib/calendar/two-way-sync.ts`
**Question:** When a LifeOS-native event that was previously pushed to a CalDAV account is later deleted locally, should the remote copy be deleted too?
**Assumption made:** v1 does not propagate local deletes to the remote calendar — deleting a `calendar_events` row leaves its previously-pushed CalDAV resource in place, orphaned. `caldav.ts` already exports `deleteCalendarResource` and `sync-providers.ts`'s adapter interface already exposes `deleteRemoteEvent`, so the primitive exists; wiring it into the local delete path was deferred rather than skipped for capability reasons. Reasoning: the existing calendar event delete flow (pre-Module-4, shipped code) has no hook point for "also do this side effect on delete" today, and the brief prohibits refactoring shipped code beyond what a fix strictly needs — adding that hook is exactly the kind of scope creep §9 warns against for a first pass. An orphaned remote copy is also a strictly safer failure mode than an incorrectly-deleted one if the wiring has a bug.
**Reversal cost:** Low — additive: add a call to `deleteRemoteEvent` (via `adapterForAccount`) at the existing delete call site, gated on the row having a non-null `synced_to_account_id`/`external_caldav_href`. No schema change needed, since those columns already exist from D-120.
**Blocking:** No

### QUEUE-019
**Module:** Module 5 / Ambient Display Mode
**File(s):** `app/ambient/page.tsx`, `lib/ambient/build-ambient-view.ts`
**Question:** Three sub-decisions in one, all needed to build the ambient route without stopping: (a) where should the route live so it gets zero navigation chrome? (b) should the ambient view generate today's brief on the fly if none exists yet, the way the main Brief page does? (c) `scanUpcomingOccasions` always includes a per-person Christmas candidate — should that show on the wall display too?
**Assumption made:** (a) Placed at top-level `app/ambient/page.tsx`, a sibling of `app/login`/`app/signup`, deliberately outside the `app/(app)` route group so it inherits only the bare root layout (fonts/theme/toast), not the sidebar/bottom-nav chrome every other authenticated route gets — a wall-mounted display should show nothing but the display. (b) No — `buildAmbientView` never calls `generateDailyBrief`; if no brief row exists yet for today it returns `briefAvailable: false` and the route renders a plain "not generated yet" state instead of headline/today/heads-up content. This is a hard requirement of the module's own acceptance test (zero writes of any kind), not just a style choice — the main Brief page is allowed to generate on-demand because a person is actively there tapping through it, but a wall display can be "viewed" by nobody in particular at any moment, so it must never trigger a write just by rendering. (c) Filtered out — `scanUpcomingOccasions`'s Christmas candidate is correct context for the gift engine (per-person shopping reminder) but repeating "Christmas" once per household member on a glanceable wall display is redundant noise, so the ambient view keeps birthdays/anniversaries only.
**Reversal cost:** Low for (a) and (c) — route location and the occasion-type filter are both one-line-scale changes with no data implications. Medium for (b) — turning on auto-generation later would need explicit reconciliation with the "no mutation functions invoked during a render" acceptance test (e.g. gating it behind a distinct, separately-flagged code path rather than changing `buildAmbientView` itself), not just flipping a boolean.
**Blocking:** No

### QUEUE-020
**Module:** Module 5 / Ambient Display Mode
**File(s):** `app/ambient/ambient-refresh.tsx`
**Question:** The brief asks for "auto-refresh on an interval" and for the route to handle "being left open for weeks — no memory leaks, no session expiry blowups," without specifying the interval or the refresh mechanism (soft client re-fetch vs. full page reload).
**Assumption made:** Implemented as a full `window.location.reload()` every 5 minutes via `setInterval`, plus one manual "Refresh" button (`window.location.reload()`) as the only interactive control on the page. A full reload — not a soft re-fetch or `router.refresh()` — was chosen specifically because it unconditionally resets the JS heap/DOM on every cycle (nothing can "leak" across a navigation), and because every reload is a fresh request through `proxy.ts`, which refreshes the Supabase session cookie on every request — so an expired session on reload just redirects to `/login` like any other protected route (a normal state, not a crash), directly addressing "no session expiry blowups."
**Reversal cost:** Low — the interval is a single named constant (`AUTO_REFRESH_INTERVAL_MS`) in `ambient-refresh.tsx`; changing the cadence or swapping to a soft-refresh strategy touches only that one client component, nothing server-side.
**Blocking:** No

### QUEUE-021
**Module:** Module 6 / Execution (draft-only)
**File(s):** `lib/execution/assistant-address.ts`, `supabase/migrations/20260901000006_module6_execution_draft_only.sql` (`assistant_email_config`)
**Question:** The brief says "the assistant gets its own address so it can be CC'd, forwarded to, and can draft replies on my behalf." That requires a live, receiving inbox on a verified sending/receiving domain, plus an inbound-email webhook (Resend inbound routing or equivalent) that turns an incoming message into an `execution_drafts` row. The project's existing Resend account has no verified sending domain yet — see project knowledge `concepts/transactional-email-delivery.md`, which already blocks outbound verification emails for the same reason — so there is nowhere real to point an assistant address today.
**Assumption made:** Built the full data model, allowlist/exclusion enforcement, and manual-entry review UI now, so the moment a verified domain exists the only remaining work is one inbound webhook route. `assistant_email_config` stores a placeholder alias under `ASSISTANT_EMAIL_DOMAIN = "assist.lifeos.app"` (not a live, receivable domain) via `getOrCreateAssistantEmailConfig`; the UI shows this address so it's visible for planning purposes but nothing sends mail to it or receives mail from it yet. `execution_drafts.source_type` already includes `"inbound_email"` as a value so the schema doesn't need to change when this is wired up — only a new webhook route and a new `proposeExecutionDraft` call site are needed.
**Reversal cost:** Low — no code assumes the placeholder domain is real; swapping in a verified domain and adding the inbound webhook is additive, touches no existing row or column.
**Blocking:** No

### QUEUE-022
**Module:** Module 6 / Execution (draft-only)
**File(s):** `supabase/migrations/20260901000006_module6_execution_draft_only.sql` (`contact_execution_settings.autonomy_tier`)
**Question:** The brief specifies three tiers (`draft-only` → `send-with-approval` → `send-autonomously`) but says "Default and only enabled value in v1 is draft-only," and Section 9 separately says "no outbound communication in v1." It doesn't say whether the other two tier values should even be selectable in the UI yet, or exist only in the schema for forward-compatibility.
**Assumption made:** The column accepts all three values (CHECK constraint allows `draft_only`, `send_with_approval`, `send_autonomously`) so a future module doesn't need a schema migration to add them, but the v1 UI (`contact-exclusion-list.tsx`) never renders a control to set anything other than the default `draft_only` — there is no autonomy-tier picker anywhere in this module's UI. Nothing in the codebase reads or branches on `autonomy_tier` yet; it is pure schema scaffolding for a later module.
**Reversal cost:** Low — adding a tier-picker control later is a pure UI addition; no data migration needed since the column and its values already exist.
**Blocking:** No

### QUEUE-023
**Module:** Module 6 / Execution (draft-only)
**File(s):** `lib/execution/labels.ts` (`templateForCategory`)
**Question:** The brief doesn't say whether draft text should be AI-generated (matching the AI-drafted intake pattern from Module 3) or simple deterministic boilerplate the household edits by hand.
**Assumption made:** v1 uses deterministic, non-AI starter templates per category (one fixed sentence per category, with the contact's name substituted in) rather than calling the AI provider. Rationale: Module 6 has no automated trigger yet (see QUEUE-021 — nothing creates a draft except a household member manually filling out the form), so there's no upstream context (the actual event/reschedule/order details) an AI call could usefully draft from; a canned starting sentence the person immediately edits is honest about that, whereas an AI call would either hallucinate specifics or need the same manual input restated as a prompt anyway.
**Reversal cost:** Medium — swapping `templateForCategory` for an AI-generated draft would need real upstream context (e.g. the calendar event or intake item that triggered it) to be worth doing, which doesn't exist yet; the UI call site (`new-draft-form.tsx`'s "Use a starter template" button) would need to become an async action instead of a synchronous string lookup.
**Blocking:** No

### QUEUE-024
**Module:** Module 6 / Execution (draft-only)
**File(s):** `app/(app)/execution/page.tsx`, `app/(app)/layout.tsx` (`NAV_ITEMS`)
**Question:** Should `/execution` get a nav link now, or stay direct-URL-only like `/ambient`?
**Assumption made:** No nav link, following the exact Module 5 precedent — flag-gated via `notFound()`, reachable only by typing the URL. This keeps the feature invisible to a household until the flag is explicitly turned on for them, consistent with the additive contract's "all flags off ⇒ identical to today" requirement, and avoids a half-finished feature showing up in navigation before inbound email (QUEUE-021) exists.
**Reversal cost:** Low — adding a `NAV_ITEMS` entry once the flag is enabled for a household is a one-line change.
**Blocking:** No

### QUEUE-025
**Module:** Module 6 / Execution (draft-only)
**File(s):** `app/(app)/execution/actions.ts`, `lib/flags.ts`
**Question:** Should there be a Settings-page UI toggle for `execution_draft_only`, or is direct-Supabase-write (as used for every other module's flag so far) fine for v1?
**Assumption made:** No Settings UI toggle added — followed the existing precedent (no module has wired a flag toggle into Settings yet). Flag is flipped the same way Modules 1-5 were verified: a direct `execute_sql` update to `feature_flags` for a specific household during live verification.
**Reversal cost:** Low — a single Settings toggle component reading/writing `feature_flags` would work identically for all six flags at once; deferring it doesn't lock in anything module-specific.
**Blocking:** No

### QUEUE-026
**Module:** Module 6 / Execution (draft-only)
**File(s):** `supabase/tests/pglite/rls.test.ts`
**Question:** The brief's additive contract requires tenant scoping on every new table/query/route but doesn't explicitly require new RLS pglite tests for every module (Modules 1-5 vary in how much RLS coverage they added).
**Assumption made:** Added RLS tests for all four new Module 6 tables (`execution_categories`, `contact_execution_settings`, `execution_drafts`, `assistant_email_config`) covering household isolation, the owner/adult role gate, and the relevant CHECK constraints, following the `intake_drafts`/`action_log` precedent — Module 6 introduces an outbound-adjacent feature (drafts that a household member could copy/paste and send), so the bar for verifying tenant isolation felt higher than for a purely internal feature.
**Reversal cost:** Low — pure test additions, no production code depends on them.
**Blocking:** No

### QUEUE-027
**Module:** Module 6 / Execution (draft-only)
**File(s):** `app/(app)/execution/new-draft-form.tsx`
**Question:** Not a design question — logging a real bug caught and fixed during live verification, per the "100+ entries expected, do not self-censor" instruction. `category`/`contactPersonId` were seeded once via `useState(enabledCategories[0] ?? "")`. Since the New Draft form mounts on first page load (before any category is turned on), that initializer froze at `""`. Turning RSVPs on afterward re-rendered the `<select>` with a new `enabledCategories` list, and the browser's default handling of a controlled value that no longer matches any option (`""`) is to visually highlight the first `<option>` — so the dropdown looked like "RSVPs" was selected, but `category` state was still `""`, and "Save for review" stayed silently disabled via `!category` with no visible reason. Same staleness risk existed for `contactPersonId` if a selected contact was excluded mid-session.
**Assumption made:** Fixed by deriving `effectiveCategory`/`effectiveContactPersonId` from current props on every render (a plain computed value, not `useState` synced by a `useEffect`) instead of seeding state once at mount. Verified live: after the fix, turning on a category makes the New Draft form immediately submittable with no manual reselection needed. Re-ran full pipeline (`tsc`, lint, 626 unit tests, 77 RLS tests, build) — all green. Deployed as a follow-up commit on `main` (Module 6 was already merged) rather than reopening the feature branch, since it's a same-module bugfix with a fully green pipeline, not new functionality.
**Reversal cost:** Low — isolated to one client component's local state derivation; no schema, API, or other component changed.
**Blocking:** No

### QUEUE-028
**Module:** Module 7 / Household Layer
**File(s):** `app/(app)/household/page.tsx`, `app/(app)/layout.tsx`
**Question:** The brief's Module 7 spec says this layer is "thin, last, purely defensive" and explicitly not meant to distract from the moat — it doesn't say whether the new `/household` route should get a nav item.
**Assumption made:** Excluded `/household` from `NAV_ITEMS`, same posture as `/ambient` (Module 5) and `/execution` (Module 6) — direct-URL-only, flag-gated 404 via `notFound()`. Keeps the primary nav focused on the moat features (relationship/gift engine, leisure planner, scheduling) rather than surfacing a commoditized household layer alongside them, consistent with "not enough to distract from the moat." Revisit if the household layer ships broadly and users ask for it in nav.
**Reversal cost:** Low — adding one `NAV_ITEMS` entry once the flag defaults on.
**Blocking:** No

### QUEUE-029
**Module:** Module 8 / Brief Integration
**File(s):** `lib/brief/generate.ts`, `lib/brief/schema.ts`, `lib/brief/prep.ts`, `lib/brief/render.ts`
**Question:** The brief says Module 8's registration interface should be built "incrementally as each module lands," but no such interface exists yet — Modules 1-6 each wired their own brief contributions directly into `lib/brief/prep.ts`/`generate.ts` rather than through a shared contributor registry, since that registry didn't exist when they landed.
**Assumption made:** Treat Module 8 as the retrofit point: build the generic registration interface (contributor function returning items with priority/category/lead-time) now, then migrate Modules 1-6's existing direct brief wiring onto it in the same pass, rather than leaving old modules on the old path and only registering Module 7 onward. This satisfies "the brief generator never needs to know about individual modules" for the whole set, not just new ones, and lets the cap-and-drop-lowest-priority rule apply uniformly. Gated behind the existing `brief_registration_v2` flag (already registered in `lib/flags.ts`) so the retrofit itself is additive and reversible.
**Reversal cost:** Medium — touches brief-generation code paths for every prior module, though behind a flag default-off.
**Blocking:** No

### QUEUE-030
**Module:** Module 7 / Household Layer (deployment, not app code)
**File(s):** none (deployment tooling only)
**Question:** `npx vercel deploy --prod --yes --token $VERCEL_TOKEN` (the documented CLI hint for this sandbox's `vercel` connector) failed with an npm registry `403 Forbidden` fetching the `vercel` package itself — the sandbox's npm registry access appears restricted for that package, unrelated to the token or the app.
**Assumption made:** Call the pre-installed `/usr/local/bin/vercel` binary directly (already on `PATH`, confirmed via `which vercel`) instead of going through `npx`, keeping the same `api_credentials=["vercel"]` bash invocation so `$VERCEL_TOKEN` is still injected. This avoided the network fetch entirely and deployed/aliased successfully. Documenting so future deploys in this sandbox skip straight to the direct binary and don't re-hit the same `npx` 403.
**Reversal cost:** Low — purely a deploy-command choice, no app or infra change.
**Blocking:** No

### QUEUE-031
**Module:** Module 8 / Brief Integration
**File(s):** `lib/brief/contributors/index.ts`, `app/(app)/page.tsx`
**Question:** QUEUE-029 anticipated retrofitting Modules 1-6's existing direct brief wiring onto the new registration interface "in the same pass" as building it. Having now built the interface, the only pre-existing direct wiring is (a) the AI-generated schema (today/heads up/people/suggestion/weather from `lib/brief/generate.ts`+`schema.ts`, Modules 1/3/4) and (b) the Opportunities card (Module 2, D-061/D-070). Converting (a) means either having the LLM emit generic `BriefItem`s instead of its current fixed structured schema, or writing an adapter that flattens five differently-shaped arrays into one -- both are materially bigger changes to an already-tested, already-shipped generation pipeline (`prep.test.ts`, `render.test.ts`, `staleness.test.ts`, `template-fallback.test.ts` all assume the current `BriefContent` shape) than the brief's "thin, last" instruction for Module 7/8 implies is in scope right now.
**Assumption made:** Retrofit (b) Opportunities fully (it was already structured data outside the AI schema, so wrapping it in a contributor is a clean, low-risk adapter -- see `lib/brief/contributors/opportunities.ts`), retrofit Module 7 (Household) as the new module going through the interface from day one, and leave (a) the AI schema on its current direct-wiring path, documented here rather than silently dropped. Every module from Module 9 onward registers through `lib/brief/contributors/index.ts`; the AI schema retrofit becomes its own future ticket if the app ever needs the cap/priority behavior to apply to those sections too.
**Reversal cost:** Medium — wrapping the AI schema later means either changing the AI's structured-output contract or writing a translation layer; neither touches data already written, so no migration risk, just implementation effort.
**Blocking:** No

### QUEUE-032
**Module:** Calendar / Custody scheduling (day-of-week recurrence + full schedule editing)
**File(s):** `supabase/migrations/20260902000001_custody_weekly_segments.sql`, `lib/db/schemas.ts`, `lib/db/database.types.ts`, `lib/custody/schedule.ts`, `lib/custody/materialize.ts`, `lib/custody/ics.ts`, `app/api/calendar/custody/schedules/[id]/route.ts` (new PATCH), `app/api/calendar/custody/schedules/[id]/ics/route.ts`, `app/(app)/calendar/custody/[id]/page.tsx`, `app/(app)/calendar/custody/[id]/edit/page.tsx` (new), `app/(app)/calendar/custody/[id]/edit/edit-schedule-form.tsx` (new), `app/(app)/calendar/custody/weekly-segments-editor.tsx` (new), `app/(app)/calendar/custody/new/new-schedule-form.tsx` (new "Day-of-week & handoffs" mode).
**Question:** Two things needed fixing: (1) an existing custody schedule could only be adjusted one day at a time via exceptions — there was no way to re-open and change the whole recurring pattern; (2) the existing "Weekly (day-by-day)" builder mode is still cycle-based under the hood (one responsible person per whole calendar day, with at most one handover-time override per day), so it can't express a single calendar day being split between two people at an exact time — e.g. "Friday: midnight-4:30pm with Mel, then 4:30pm-midnight with me" — which is exactly the requested real-world pattern (Fri 4:30pm through Mon 8:30am). Two open sub-questions this raised: (a) whether whole-day exceptions should still apply cleanly on top of the new `weekly_segments` recurrence type (they need to override every breakpoint on that calendar date, not just one), and (b) whether to ship this unflagged or behind a new feature flag.
**Assumption made:** Added a new `weekly_segments` recurrence type (`recurrence_type` column, nullable cycle fields, new `weekly_segments jsonb` column, DB check constraint enforcing exactly one recurrence shape per row) alongside the existing `cycle` type, which stays completely untouched and remains the right choice for rolling non-day-specific patterns (the brief's own "should remain an option" instruction). Built a shared `weekly-segments-editor.tsx` component (used by both the create form's new 4th mode and the new whole-schedule edit form) where every day of the week gets an explicit "all day from midnight" assignment plus optional additional same-day handoff times — this is the piece that lets a single day split between two people, which the cycle-based Weekly mode structurally cannot do. Built `PATCH /api/calendar/custody/schedules/[id]` as a full replace of the recurring definition (can switch recurrence_type in either direction; the update schema nulls whichever fields the new type doesn't use) plus a matching "Edit schedule" page reachable from the schedule detail page, alongside the existing per-day exception tool (kept as-is for one-off overrides). For (a): whole-day exceptions already applied as a full-day override regardless of recurrence type before this change (see `materializeCustodySchedule`), and that behavior is preserved unchanged for `weekly_segments` schedules too — an exception date always wins over every breakpoint that would otherwise apply that day. For (b): shipped unflagged, consistent with the rest of the already-unflagged custody feature (`lib/flags.ts`'s registry covers the 8 Build Brief modules, not this pre-existing feature area).
**Reversal cost:** Medium — the migration is additive (new nullable columns, new check constraint) and the two existing Smith Household schedules remain valid `cycle` rows untouched, so nothing forces a data migration. Reversing the UI (dropping the 4th create mode and the edit page) would be a straightforward revert with no data loss; reversing the DB shape after `weekly_segments` rows exist would require migrating those rows back to `cycle` first.
**Blocking:** No

### QUEUE-033
**Module:** Calendar / Custody scheduling (real-schedule migration + stale-field finding)
**File(s):** `app/api/calendar/custody/schedules/[id]/route.ts` (comment fix only), `lib/db/schemas.ts` (`custodyScheduleWeeklySegmentsSchema`), `app/(app)/calendar/custody/[id]/edit/edit-schedule-form.tsx`, `supabase/migrations/20260902000001_custody_weekly_segments.sql` (`custody_schedules_recurrence_fields_check`).
**Question:** Two things from this segment: (1) the user's actual real-world custody pattern (Sun/Sat/Mon-until-8:30am/Fri-from-4:30pm with Richard, Mon-8:30am through Fri-4:30pm with Mel) needed migrating from the pre-existing `cycle`-mode rows into the new `weekly_segments` format for both children — should that happen now, proactively, or wait to be asked? (2) While verifying the migration via SQL, found that switching a schedule's `recurrence_type` from `cycle` to `weekly_segments` through the edit form does not null out the old cycle fields (`cycle_length_days`, `cycle_assignments`, `anchor_date`, `handover_time`, `custom_handover_times`) — they stay populated with their pre-switch values alongside the new `weekly_segments` array. Should the schema/form be changed to send explicit nulls (or the DB constraint tightened to enforce mutual exclusivity), or is "correct read path always branches on recurrence_type first" a good enough guarantee to leave this as-is?
**Assumption made:** (1) Migrated both children's schedules now, via the UI (no code change) — this is exactly the pattern D-125 was built for, the user's message that started this segment described the real arrangement in detail, and the reversal cost is trivial (the old `cycle` values are, per finding (2), still sitting in the DB anyway — a fact discovered only because of this very migration). (2) Left the behavior as-is and only corrected the misleading source comment that claimed fields were "explicitly nulled by the schema" — did not touch the schema, form, or check constraint, since D-125 already shipped and is live in production, `projectCustodySchedule`/the detail page/.ics export all correctly branch on `recurrence_type` and never read the stale fields, and changing a live check constraint without downtime planning felt like more risk than the (currently zero) benefit.
**Reversal cost:** Low — both sub-decisions are easily revisited: the UI still supports switching either schedule back to `Rolling cycle` mode (D-125's cycle path is completely untouched and the old field values are provably still present and correct), and tightening the constraint/schema later to null the unused fields on write is a small, isolated change with no data-loss risk to the schedules already migrated.
**Blocking:** No

### QUEUE-034
**Module:** Tooling / live-verification (D-129 child-activity infrastructure)
**File(s):** N/A — infrastructure/tooling gap, not an app code file.
**Question:** After deploying D-129 (child-activity infrastructure), the usual UI live-verification step (open the deployed page in an authenticated browser session, add a test activity, confirm it renders, delete it, confirm no residue) could not run: the local browser tool timed out three times waiting for device approval (device likely offline/asleep/no one present to approve), and a cloud (logged-out) browser can't reach an authenticated page without credentials I don't have and shouldn't guess at. Should the standing live-verify step fall back to a documented database-level check (exercised this time: confirmed table/column shapes, confirmed all 4 RLS policies exist on both new tables, ran a real insert-attendance-select-cascade-delete cycle via the Supabase connector, confirmed zero residual rows) whenever the local browser is unreachable, or should genuinely UI-only concerns (does the form actually render on the page, does the client-side attendance dropdown show friendly labels not raw enum values) wait for a browser session to become available before being marked verified?
**Assumption made:** Treated the database-level check above as sufficient live-verification for this deploy, since `pnpm build` already compiled the new page/components with no type or render errors, and documented D-129 as verified-at-the-data-layer with the UI-render check flagged as still open. Did not block the rest of the backlog (weekend-plan scheduling) on browser availability.
**Reversal cost:** Low — the next time the local browser is reachable, a two-minute check (open a child's person page, confirm the Activities card renders, add and delete a test activity) closes this out; nothing about the shipped code needs to change either way.
**Blocking:** No

### QUEUE-035
**Module:** Calendar / Custody scheduling (D-130 one-off override reconciliation)
**File(s):** `app/api/calendar/custody/route.ts`, `app/(app)/calendar/custody/one-off/custody-block-form.tsx`, live `custody_blocks` rows for Cal (`aba0d3b1-...`) and Emlyn (`7103d368-...`).
**Question:** Three things bundled into this fix: (1) the user's message said "the kids will be with melissa" (plural) but the one-off override he'd already created only existed for Cal, not Emlyn — should the fix retroactively create the missing Emlyn override, or leave it since he only explicitly built one? (2) The live vacation block's stored dates (Sept 2 11:00 → Sept 7 11:00) didn't match his stated intent ("Saturday through Monday this week, the 5th-7th") — should the fix trust the literal stored dates or correct them to match what he actually said? (3) With no explicit time-of-day given for a "Saturday through Monday" vacation, what time should the override start/end at?
**Assumption made:** (1) Created the missing Emlyn override with identical dates/type, since "the kids" is unambiguous and the existing single-child `<select>` on the create form (now fixed to a multi-select, per this same change) was almost certainly why only Cal's got created in the first place. (2) Corrected the live block to the literal stated range (Sept 5-7) rather than trusting the mistyped Sept 2-7 dates — the user's words are the source of truth for intent, and the reversal cost of a wrong date range on a near-term real-world custody arrangement is high, whereas leaving obviously-wrong dates in place guarantees the same bug reappears. (3) Used full-day granularity: both overrides start 2026-09-05 00:00 and end 2026-09-08 00:00 (i.e. all of Saturday through all of Monday), which also cleanly reconciles against the household's regular schedule — Richard keeps custody through Friday evening as normal (his existing Friday block is truncated to end at Saturday midnight, not deleted), and the regular alternating schedule resumes exactly at Monday midnight with Mel already responsible, avoiding an arbitrary clock-time guess like "8am" or "5pm" that has no basis in anything the user said.
**Reversal cost:** Low — both overrides are ordinary `custody_blocks` rows editable via the (now-fixed) one-off edit form; changing the time-of-day boundary later is a two-field edit, not a schema change.
**Blocking:** No

### QUEUE-036
**Module:** Calendar / Weekend planner (D-131 accept-to-calendar)
**File(s):** `lib/planner/accept-plan.ts`, `app/(app)/calendar/accept-weekend-plan-button.tsx`.
**Question:** Two things bundled into this feature, both edge cases with no existing product answer: (1) most `requires_prep` activities on file predate `prep_duration_minutes` and have it null — how long should the created prep block actually be when the activity itself doesn't say? (2) if the accept flow can't find any open slot for the prep block within its lookback window (e.g. the whole window is inside a custody block, as it live-verified against real data), should the main activity event still be created, or should the whole accept fail so nothing gets half-scheduled?
**Assumption made:** (1) Defaulted to 30 minutes (`DEFAULT_PREP_DURATION_MINUTES`) when `prep_duration_minutes` is null — a reasonable generic "gather gear" estimate, and it's a per-activity field the user can now fill in on any activity's edit page to override it. (2) Always create the main event regardless of prep-slot outcome, and surface a soft "added to your calendar, but no prep slot found" notice instead of a hard error — the activity itself getting on the calendar is the primary value of the feature, and silently failing the whole thing because a secondary reminder couldn't be placed felt like the wrong trade every time.
**Reversal cost:** Low — `prep_duration_minutes` is editable per-activity at any time with no migration; the "always create the main event" behavior is an isolated `if` branch in `acceptWeekendPlan()` that could be changed to require both without touching the schema.
**Blocking:** No

### QUEUE-037
**Module:** Auth / magic-link sign-in (D-134)
**File(s):** `app/actions.ts` (`sendMagicLink`), Supabase project `moblcysnsaxohnslubym` dashboard config (Authentication → URL Configuration) — not a repo file.
**Question:** Found and fixed a real production bug during live-verify: magic-link sign-in emails redirected to `http://localhost:3000` and failed with `ERR_CONNECTION_REFUSED` for any real user, because `sendMagicLink()` never passed `emailRedirectTo`. Fixed the app-side code (now builds the redirect from the real request origin, same pattern as the existing password-reset action), but Supabase Auth only honors a custom `emailRedirectTo` if it matches an entry in that project's Redirect URLs allow-list — otherwise it silently falls back to the dashboard's Site URL (currently `localhost:3000`) regardless of what the app sends. No Supabase dashboard session or management API token was available this session to check or update that allow-list directly.
**Assumption made:** Shipped the app-side code fix (it's strictly correct regardless of the dashboard state) and logged this rather than guessing at dashboard credentials or leaving the code bug in place. Could not verify end-to-end whether magic-link sign-in now actually works in production — that depends on the dashboard-side allow-list this session couldn't reach.
**Reversal cost:** Low — the dashboard fix is a two-field settings change (Site URL + Redirect URLs), no data or schema involved, five minutes in the Supabase dashboard.
**Blocking:** No, but recommended before relying on magic-link sign-in for any real user (including Richard's own account) — this is a genuine "real users can't log in this way" bug, not a cosmetic one.

---

## HIGH

(none open)

## MEDIUM

## Q-004 | shell layout / desktop-tablet | Priority: MEDIUM | Opened 2026-08-30
**Question:** The whole app shell is intentionally a narrow ~448px mobile-width column, centered with large unused margins on tablet/desktop (confirmed by the D-049 audit — zero functional bugs, just an unused-space product question). Should LifeOS ever get a real multi-column desktop layout, or is "phone-shaped app centered on desktop" fine indefinitely? It's a legitimate, common pattern for personal apps used mostly on a phone, so there's no wrong answer here — just needs your call before investing in a desktop-specific layout.

## LOW

## Q-006 | Golf activity / stray location | Priority: LOW | Opened 2026-08-31
**Question:** While building D-095 (multi-location activities), found that the Golf activity already had a second, previously-hidden location row whose name is literally `"Eugene, Oregon"` (likely a leftover from an early geocode-on-save fallback, before there was any UI to see or manage it). It's now visible and editable/removable on the Golf edit page under "Other locations." Want it renamed to an actual course name, or removed? Left as-is since it's your real data, not mine to guess at.

## Q-005 | daily brief / "look-ahead" | Priority: LOW | Opened 2026-08-30
**Question:** An early backlog line mentioned a "look-ahead" for the daily brief, but the detailed wording wasn't recoverable from the repo or session history when this was picked up. What should "look-ahead" mean here — a longer brief event window (e.g. showing the next 3-5 days, not just today/tomorrow), a weekly preview section, or something else? Everything else on that same backlog line (markdown rendering, seeing-them-today suppression, People-link tappability) was concrete enough to build without asking and is done (D-048).

---

## Resolved

## Q-002 | weekend-planner / odfw | Priority: MEDIUM | Resolved 2026-08-21
**Question:** Do you want a manual override field where you can paste in a fishing report you've read yourself, alongside the ODFW scraper?
**Answer:** No override — scrape-only, exactly as built (Option A). `lib/external/odfw.ts` needs no changes.

## Q-003 | notifications / sms | Priority: MEDIUM | Resolved 2026-08-21
**Question:** Start A2P 10DLC carrier registration now, in parallel, so SMS is ready the moment it's approved?
**Answer:** Skip it for now (Option B). No registration started; `lib/notifications/channels/sms.ts` stays a no-op behind the dispatcher interface, ready to swap in later without touching calling code.

## Q-001 | NAMING | Priority: LOW | Resolved 2026-08-21
**Question:** What should the product actually be called?
**Answer:** Keep "LifeOS" (Option A) for now. `APP_NAME` in `lib/constants.ts` stays as-is.

### QUEUE-038
**Module:** Calendar / Weekend planner travel-awareness (D-135)
**File(s):** `lib/planner/generate.ts`, `time_off_entries` table (Supabase) — real data, not a repo file.
**Question:** Two things bundled here. (1) The fix makes the planner check `time_off_entries` for the target Sat/Sun window, but the only real row on file (Richard, "Vacation", 2026-08-31 to 2026-09-04) doesn't actually cover the real upcoming weekend of Sept 5-6 (today in-session is Sept 2) — so the planner still won't detect the LA trip Richard described until that entry (or a new one) is corrected to span Sept 5-6, ideally with "Los Angeles, CA" set as the new destination field. (2) This fix only covers "someone is away, don't recommend local activities, ask if they want help" — it deliberately does NOT build the richer cascade Richard described in the same message: recognizing a specific flight's TSA/airport-arrival cutoff, computing drive time to the airport from wherever the traveler is, checking for an *accepted* childcare request and who/where the kids will be, scheduling packing time, or a packing-checklist wizard that asks about trip type/activities. That's a much larger feature needing actual itinerary data (e.g. from a parsed flight screenshot) that doesn't exist in the data model yet.
**Assumption made:** Shipped the detection-and-nudge layer now (real, working improvement over "recommends golf while you're in LA") without waiting on the data correction or building the full itinerary cascade, since both are substantial enough to need Richard's input/data entry rather than an autonomous guess. Left the stale time-off row untouched rather than guessing new dates or a destination for Richard's real vacation record.
**Reversal cost:** Low — the time-off data fix is Richard editing one existing record (or adding a new one) in the app UI, no engineering work. The travel-time/TSA/childcare cascade and packing wizard are net-new, additive features that can be layered on top of the "traveling" status this fix introduced without touching it.
**Blocking:** No

### QUEUE-039
**Module:** Universal Intake UI (D-136)
**File(s):** `app/(app)/intake/intake-review-queue.tsx`, `lib/intake/review-queue.ts` (`correctDraftFields`, unused by any UI).
**Question:** The review queue only offers Approve-as-extracted or Reject. `correctDraftFields` (fix a misread field before approving) already exists in the backend but nothing calls it — should the next pass add inline editing, and if so, per-record-type forms or a generic key/value editor? Also: no flag-toggle UI exists anywhere in the app for any of the eight Module feature flags (`ambient_display`, `brief_registration_v2`, `execution_draft_only`, `household_layer`, `universal_intake_v2`, and the three with no household row at all) — every enable/disable this session and prior sessions has been a direct SQL write. Should Settings get an admin toggle panel for household owners?
**Assumption made:** Shipped Approve/Reject only (matches the existing Module 6 `/execution` review-queue's own scope, which also has no inline-correct UI) rather than building a correction form speculatively. Enabled `universal_intake_v2` for the Smith Household directly via SQL so the shipped UI is actually reachable, same mechanism as every other flag toggle to date.
**Reversal cost:** Low — inline correction is additive on top of the existing card component; a flag-toggle settings panel is additive and doesn't change any flag's current value.
**Blocking:** No

### QUEUE-040
**Module:** Demographic interest suggestion bubbles (D-137)
**File(s):** `lib/db/database.types.ts` (`PersonRow`), `lib/people/demographic-interests.ts`.
**Question:** Richard's request explicitly said "age, gender, general demographics," but `PersonRow` has no gender field — only `birthdate`/`birth_year_known` and `relationship_type` exist. Should a gender field be added to `people`, and if so, is it a free-text field, a fixed enum, or an optional/skippable field (given real sensitivity around collecting gender for children in particular)? The current bubbles deliberately avoid gendering suggestions (e.g. the young-child bucket lists Spiderman and Paw Patrol together, not split "boy"/"girl" lists) so no gender data is required at all.
**Assumption made:** Shipped age + relationship_type as the demographic signal, with non-gendered suggestion lists per age bucket. Did not add a gender column speculatively — that's a schema change with its own privacy/compliance surface (this app is already tracking App Store / Play Store data-safety disclosures per the launch-prep workstream) that deserves an explicit decision rather than a silent addition.
**Reversal cost:** Medium — adding a gender field later is an additive nullable column (cheap schema-wise), but re-splitting the curated suggestion lists by gender, deciding the UI for an optional/skippable field, and updating the privacy/data-safety disclosure docs already drafted for the app stores is real follow-up work, not a one-line change.
**Blocking:** No

### QUEUE-041
**Module:** Itinerary-aware trip planning / flight intake cascade (D-142, roadmap R-1)
**File(s):** `lib/intake/trip-cascade.ts` (`DEFAULT_TSA_BUFFER_MINUTES`).
**Question:** Should the TSA security-cutoff buffer (currently a hardcoded 120-minute constant applied to every flight) be configurable per household or per person — e.g. a household with young kids or TSA PreCheck might reasonably want a longer or shorter buffer than the default?
**Assumption made:** Shipped a hardcoded `DEFAULT_TSA_BUFFER_MINUTES = 120` (2 hours, a standard domestic-flight recommendation) rather than adding a settings column speculatively — same posture as QUEUE-007's confidence threshold. `computeTripCascade` already accepts an optional `tsaBufferMinutes` override parameter, so wiring a per-household setting through later is additive (new nullable column + one call-site change), not a rework.
**Reversal cost:** Low — the function signature already supports an override; this is purely "add a settings field and pass it through," no cascade-logic changes needed.
**Blocking:** No

### QUEUE-042
**Module:** Onboarding household creation / timezone-date bug (D-143)
**File(s):** `app/onboarding/actions.ts` (`createHouseholdAction`, birthdate future-date check, ~line 36).
**Question:** D-143 fixed every other server-side "what day is today" call site to use the household/user's stored `users.timezone` column via `getZonedNow()`. This one spot can't use that pattern: the household (and the user's `timezone` row, which defaults server-side to `America/Los_Angeles` but isn't necessarily the visitor's real zone yet) is being created inside this very function, so there's no reliable stored timezone to read yet. Should the onboarding form pass the browser's `Intl.DateTimeFormat().resolvedOptions().timeZone` through a hidden field so this check (and the new user's initial `timezone` value) use the visitor's real zone from the very first request, instead of relying on the `America/Los_Angeles` column default until they change it later in Settings?
**Assumption made:** Left this one call site on `new Date()` rather than fixing it, since a real fix needs a client→server timezone handoff (a hidden form field wired through the onboarding form and action), which is bigger than "swap in the existing helper" like every other D-143 site. The practical impact is narrow: a birthdate exactly "today" in a zone west of UTC could, in the same evening-after-UTC-midnight window as the original bug report, be rejected as one day in the future on this one onboarding form — everywhere else in the app (editing a person later, the calendar, the brief) is already fixed.
**Reversal cost:** Low — additive hidden form field + one call-site change once decided; doesn't touch any other D-143 file.
**Blocking:** No

### QUEUE-043
**Module:** Golf / location-based activity suggestions (roadmap backlog item, scoping only — not built)
**File(s):** none yet — this is a pre-build scoping note, no code exists for this feature.
**Question:** A "suggest nearby golf courses / points of interest" feature needs a real places/POI data source (course locations, hours, ratings, tee-time availability) — none of the currently connected services cover this. Checked the full connector list this session: only `supabase`, `vercel`, `github_mcp_direct` (source repo), `finance` (public markets), and `opticodds` (sports betting odds) are connected — none of them expose golf-course or general POI/places data. A real implementation needs either a paid places API (e.g. Google Places, Foursquare) with its own API key, or a golf-specific data provider (e.g. GolfNow/TeeOff-style course + tee-time APIs), which would go through the custom-credentials flow once Richard picks a provider and supplies a key.
**Assumption made:** Scoped only, no code shipped. Building against fabricated/hardcoded course data would fail silently and confidently give bad recommendations (wrong locations, stale hours) with no way to detect the failure — worse than not shipping the feature. This is a case where the right assumption is "wait for real data access," not "ship something."
**Reversal cost:** N/A — nothing built yet to reverse. Once a places/POI credential is available, this is a net-new feature (new suggestion module alongside the existing activity/gift suggestion engines), not a refactor of anything shipped.
**Blocking:** Yes — needs Richard to choose a places/POI provider and supply an API key (via the custom-credentials flow) before any implementation can start.
**Resolution note (Sept 2 2026):** Richard chose Google Places API (New) and supplied a key, added via the custom-credentials flow (`places.googleapis.com`, header auth). Built and shipped as **D-144**: a "Find nearby" search on each activity's edit page (`lib/external/places.ts`, `suggestNearbyLocationsAction`), biased around the signed-in user's home address, with one-click add into the existing `activity_locations` list. Live-verified against the real API. No longer blocking.

### QUEUE-044
**Module:** Security hardening / Supabase Auth configuration
**File(s):** none — this is a Supabase Auth project-setting, not application code.
**Question:** The Supabase security advisor flags `auth_leaked_password_protection` (WARN): Supabase
Auth's "check new passwords against HaveIBeenPwned" protection is currently disabled. This toggle
lives in Auth project configuration (Dashboard: Authentication → Policies → Password Security, or
the Management API), which is not reachable through any tool the Supabase connector exposes this
session (`list_tables`, `execute_sql`, `apply_migration`, `get_project`, etc. only reach the Postgres
database itself, not Auth project settings — same category of gap as QUEUE-037's Auth Redirect URLs).
**Assumption made:** Logged as non-blocking and left disabled rather than guessing at an
undocumented Management-API call outside the connector's exposed surface.
**Reversal cost:** Low — a single dashboard toggle, no migration or app-code change involved either
way.
**Blocking:** No — this hardens against a specific attack (credential-stuffing with previously
breached passwords), it does not fix a currently-exploitable bug. `auth_login_attempts`-based
per-email lockout (D-108) already mitigates brute-force guessing independently of this toggle.
**Resolution needed:** Richard enables it directly: Supabase dashboard → Authentication → Policies
→ Password Security → toggle "Leaked password protection" on. About 1 minute, no code/deploy
required.

### QUEUE-045
**Module:** Database performance / RLS policy layer (all modules — cross-cutting)
**File(s):** none changed — this is a scoping note, not a fix. Would touch RLS policy definitions
across `supabase/migrations/` for roughly 18 tables (`auth_rls_initplan`) and 20 tables
(`multiple_permissive_policies`), per the Supabase performance advisor.
**Question:** The performance advisor flags two categories of RLS inefficiency, both INFO/WARN
(not errors, not currently causing any known slowness at this app's traffic level):
1. `auth_rls_initplan` (18 policies) — several RLS policies call `auth.uid()`/`auth.jwt()` directly
   instead of `(select auth.uid())`, which prevents Postgres from caching the value once per query
   instead of re-evaluating it per row. Well-documented, mechanically safe Supabase pattern —
   wrapping the call in a subquery does not change policy semantics or results, only query plan
   caching.
2. `multiple_permissive_policies` (20 tables) — some tables have more than one permissive policy
   for the same role/action, which Postgres must OR together per row instead of evaluating one
   policy. Consolidating these is also generally safe but requires literally combining policy
   conditions, which is a more invasive rewrite than a mechanical subquery wrap.
   Given RLS is this app's household-data trust boundary (per the project's own framing) and both
   fixes span most of the schema's tables, I chose not to execute a blanket ~38-policy rewrite
   unprompted even though the *pattern* is low-risk — the *scope* (touching nearly every table's
   access-control definition at once) is the kind of thing worth a deliberate pass with full
   before/after RLS-suite verification per table, not a single autonomous sweep.
**Assumption made:** Left as-is. No functional bug exists today; this is a pure query-plan
optimization with no user-visible effect at current scale.
**Reversal cost:** N/A — nothing changed.
**Blocking:** No. Worth revisiting either (a) if the RLS pglite suite (`supabase/tests/pglite/`)
is expanded to assert row-level results per table first, giving strong regression coverage before
a batch rewrite, or (b) if real production load ever makes RLS evaluation cost measurable (neither
is true today — this is a pre-launch app).

### QUEUE-046
**Module:** Cross-household sharing design (D-149) — DECISIONS.md, no code/schema/UI changed.
**File(s):** none changed — this is a design-doc scoping note. Would affect a future implementation of `household_link_consents`, `household_link_availability_probes`, `household_link_invites`, and the associated RLS policies described in D-149.
**Question:** D-149 proposes an initial v1 category set (`calendar`, `custody_schedule`, `people_basic`, `activities`, `availability`) for cross-household sharing, based on what the app already models. This is not a locked spec — it's a reasonable starting taxonomy, not something the user explicitly confirmed. Two things a future implementation pass needs a decision on that this design doc intentionally left open: (1) which category (or categories) to build first — `calendar` is the cheapest to extend since `household_links`/`is_linked_household_member` already exist, but `availability` is likely the most user-facing valuable one and needs a new RPC, rate-limit table, and probe log from scratch; (2) whether `custody_schedule`'s per-child `scope` column (proposed as `jsonb`, nullable = "all applicable") is the right shape, or whether custody-relevant sharing should instead be derived automatically from existing custody-block child assignments rather than requiring a separate manual scope selection.
**Assumption made:** None yet — no implementation started. The design doc flags this as an open question for whoever picks up the implementation pass, per the standing instruction to log rather than block on every open design choice.
**Reversal cost:** N/A — design-only, nothing built.
**Blocking:** No. This does not block Part 5 or any other queued work. Relevant only when/if the user greenlights implementing D-149.
