# QUESTIONS.md

Questions that genuinely cannot be decided without Richard's input, per Section 1.4. Sorted by priority (HIGH, then MEDIUM, then LOW) within each pass. Deduplicated.

---

## Redesign Brief Queue (RQ#)

Entries below use the format mandated by `docs/redesign-brief.md` Part 1: sequential `RQ#`
numbering (prefixed to avoid colliding with the pre-existing `Q-XXX` and `QUEUE-###` sections
below, both untouched), logged instead of stopping to ask. `// TODO(RQ#)` markers appear at the
corresponding code site.

### RQ1
**Where:** `docs/design/` (Part 0)
**What I need to know:** The brief says three reference screenshots (`today.png`, `people.png`,
`calendar.png`) live in `docs/design/`. The directory doesn't exist and no images were attached —
only the brief text was provided.
**What I did instead:** Proceeding on Part 3's text specs alone, which the brief itself says win
over the images on any disagreement. No screen is being built from a pixel reference; all layout,
spacing, and component anatomy come from Part 3's exact measurements.
**Cost of getting it wrong:** Medium — the built screens may not match the intended visual
composition/hierarchy as closely as they would with the reference images, even though every
numeric spec is followed. If the real images are added to `docs/design/` later, worth a follow-up
visual comparison pass against Today/People/Calendar specifically.

### RQ2
**Where:** `app/globals.css` (Part 4 — Colour)
**What I need to know:** Part 5 ("Errors use a destructive treatment, never the slipping colour")
and Part 7 ("Errors get their own destructive treatment") both require error/destructive UI to be
visually distinct from `slipping`, but none of the three palette tables in Part 4 define a
`destructive`/`error` token — only `action`/`settled`/`slipping`/`custody-you`/`custody-mel` are
specified.
**What I did instead:** Added one extra token per palette, `destructive` (dark/light, both modes),
chosen to read as an unambiguous "stop" red distinct from each palette's more muted/earthy
`slipping` tone: warm-evening-desk `#E5484D`/`#C4342F`, sunrise-citrus `#FF5C5C`/`#D6293B`,
harbor-bright `#FF4D6D`/`#D6234A`. Wired the same way as every other role token (CSS custom
property per palette/mode, `@theme inline` re-export, a `destructive`-soft derived tint pair) —
used only for destructive buttons and inline error states, never for `slipping`.
**Cost of getting it wrong:** Low — this is purely additive (one new token name, doesn't touch any
specified token), cheap to re-tune later, and the whole point of picking it now is exactly to keep
"error" and "relationship slipping" from reading as the same colour, which the brief requires.

### RQ3
**Where:** `components/ui/button.tsx`, table row anatomy (Part 3 — Component anatomy)
**What I need to know:** Two small internal inconsistencies in Part 3. (a) The Button spec says
"Destructive: slipping-tinted background and text," but Part 5 ("Errors use a destructive
treatment, never the slipping colour") and Part 7 ("errors get their own destructive treatment")
both explicitly require destructive/error UI to be visually distinct from `slipping`. (b) The
Table row spec gives an explicit "radius 12" for the row itself, but the Geometry section's radius
scale only defines 13-14 for cards ("Nothing off this scale") — 12 isn't on it.
**What I did instead:** (a) Treated Part 5/7's explicit, twice-stated rule as authoritative over
Part 3's one incidental phrase — the destructive button variant uses the RQ2 `destructive` token,
never `slipping`. (b) Used the literal `12px` Part 3 gives for the table row specifically (a
directly-stated number for this exact component beats inferring it from the general scale), added
as its own `--radius-table-row: 12px` token rather than silently rounding to the nearest scale
value.
**Cost of getting it wrong:** Low for both — (a) is a straightforward colour-token swap if the
intent was actually literal; (b) is a 1-2px visual difference on one component's corner radius.

### RQ4
**Where:** `app/globals.css` (Part 3 — Geometry: "Borders are 1px hairlines"; Part 9 Step 12 —
contrast pass)
**What I need to know:** Part 3's accessibility rule requires "3:1 for large text and UI
boundaries" in every palette/mode. Measuring all three palettes × both modes (6 combinations)
against real rendered colours found two categories of near-universal failure that a literal reading
of "UI boundaries" would call out, but that directly conflict with other explicit instructions in
the same document: (a) `--line`/`--line-strong` (the hairline card/table-row/divider borders) measure
1.18-1.63:1 against `--surface`/`--ground` in all 6 combinations — nowhere close to 3:1 — but Part 3
elsewhere calls for exactly this: "Borders are 1px hairlines," "No shadows in dark mode," a quiet,
low-contrast aesthetic that both reference images and the brief's own tone ("warm-evening-desk —
quietest, default") clearly intend. Pushing every hairline to genuine 3:1 would require a
meaningfully darker/heavier border on every card, table row, and divider in the app — a real,
visible departure from the described look, not a small tint nudge. (b) `harbor-bright` light mode's
`action` role colour (marigold `#c98600`) measures 2.85:1 against `--ground` — just barely under
3:1, relevant only when `action` is used as large decorative text/icon colour directly on `--ground`
(its normal use as a button background, checked separately, is unaffected and was already fixed —
see the `--on-action` fix logged inline in `globals.css`). Adjusting a defining role colour to fix
this is exactly what Part 3's own contrast-fix instruction says not to do ("adjust the derived tint,
not the role colour").
**What I did instead:** Fixed every failure that was a genuine body-text/button-text miss on a
non-defining support token (`--meta`, `--on-action`) by adjusting just that token per palette/mode —
see the inline dated comments next to each changed value in `globals.css` for the exact
before/after numbers. Left (a) and (b) alone and logged them here rather than either silently
ignoring a real numeric shortfall or unilaterally overriding the brief's own explicit hairline-border
and no-role-colour-changes instructions.
**Cost of getting it wrong:** Low for (b) — a 2.85 vs. 3.0 miss on one palette's decorative-only use
of its accent colour against the page background is a minor, easily-tuned gap if it turns out to
matter (e.g. darken `harbor-bright`'s light-mode `--action` by a few percent). Medium for (a) — if
hairline borders genuinely need to hit 3:1 (e.g. for a low-vision user who relies on the border, not
just spacing, to tell two cards apart), the fix is systemic (every `--line`/`--line-strong` value
across 6 combinations) and visibly changes the app's whole quiet aesthetic, so it's worth Richard
confirming the intent before that trade is made either way.

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

### QUEUE-003 — RESOLVED (D-160)
**Module:** Module 2 / Leisure Planner
**File(s):** `app/(app)/activities/leisure-planner-actions.ts`, `lib/planner/score-breakdown-display.ts`, `lib/planner/gear-checklist.ts`
**Question:** Same shape as QUEUE-002 (resolved via D-159) — Module 2's backend (3 new tables + `opportunities.score_breakdown`, all flagged off) is done, tested, and merged, but no UI surfaces the viability config manager, gear checklist manager, outing log form, or opportunities breakdown display yet.
**Resolution:** UI shipped — see D-160 in DECISIONS.md. Viability config manager and default-gear-checklist manager added to the Activities page; per-activity gear checklist and outing log added to the activity edit page; "Why this score?" breakdown added to the Opportunities page. All flag-gated on `leisure_planner_v2`, which is already enabled for the real household.
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

### QUEUE-006 — RESOLVED (D-165)
**Module:** Module 2 / Leisure Planner
**File(s):** `lib/planner/generate.ts`, `activity_type_viability_configs`
**Question:** Should the new `activity_type_viability_configs` table actually be wired into the existing `isFishingRelevantLocation` gate in `generate.ts`, so a household's declared viability inputs affect real scoring/gating rather than being a purely declarative, unread table?
**Assumption made:** No — v1 ships `activity_type_viability_configs` as declarative-only (a household can record and later view which inputs matter for an activity type), and the existing gate in `generate.ts` is left completely untouched, per the standing rule not to refactor existing working code. Wiring it into live gating is a larger, separate change with its own risk profile (a misconfigured household could accidentally suppress real opportunities) and is deferred to a future pass, likely alongside QUEUE-005.
**Reversal cost:** Medium
**Blocking:** No

**Update (D-165):** Richard: "Yes, wire it into suggestions." Implemented in a new pure module `lib/planner/viability-gate.ts`: a saved, non-empty config is now authoritative over which condition inputs are fetched/considered for a candidate, and a candidate is excluded when the config names a data-backed input (river_flow/odfw/tide) that no data source on the location can supply. Discovered mid-implementation that the table has no numeric threshold fields -- only which input categories matter -- so true "hide fishing when river flow crosses X" is not implementable against the current schema; this gap is now tracked separately as QUEUE-049. See D-165 for full implementation and verification detail.

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

### QUEUE-017 — RESOLVED (D-166)
**Module:** Module 4 / Scheduling Intelligence
**File(s):** `lib/calendar/two-way-sync.ts`
**Question:** For the push (LifeOS -> CalDAV) direction of two-way sync, should an already-pushed local event be re-pushed every time it's edited after the initial sync, to keep the remote copy current?
**Assumption made:** v1 pushes each local event to its CalDAV account exactly once, on the first sync after it becomes eligible (`synced_to_account_id IS NULL`). Once `pushToSyncAccount` records a `synced_to_account_id`/`external_caldav_href`/`external_caldav_etag` on the row, later edits to that event are NOT re-pushed — the remote copy reflects the event's state as of first sync only. This keeps v1 conflict-free (no need to reconcile a local edit against a possibly-also-edited remote ETag) at the cost of remote copies going stale after a local edit. Chosen because the brief explicitly calls out auto-reconciliation/auto-rescheduling as the fastest way to lose trust, and a correct edit-reconciliation policy (last-write-wins? merge? surface a conflict?) is exactly that kind of judgment call the brief says not to make silently.
**Reversal cost:** Medium — re-enabling continuous push-on-edit means clearing `synced_to_account_id` (or adding a `synced_at`/content-hash column) whenever a pushed event is edited, plus a real ETag-conflict policy for the case where the remote copy also changed; additive (new nullable column or two), but touches `pushToSyncAccount`'s selection query and needs product input on the conflict policy.
**Blocking:** No

**Update (D-166):** Richard: "always overwrite the external copy" -- explicitly chose last-write-wins with no conflict prompt, resolving the open conflict-policy question above by opting out of building one. Implemented: new nullable `calendar_events.synced_at` column distinguishes "edited since last push" from `updated_at` (which the push write itself also advances); a new `listEditedSyncedEventsForAccount` query finds already-synced events edited since; `pushToSyncAccount` re-pushes each via `adapter.pushEvent(account, icsText, { href, etag: null })` -- the `etag: null` is deliberate, forcing `If-Match: *` (blind overwrite) instead of the stored etag. See D-166 for full implementation and verification detail.

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
**Update 2026-09-04:** Confirmed this is the exact same root cause blocking password-reset emails, not just magic-link — Supabase Auth falls back to the dashboard Site URL for every email flow (magic-link, password reset, invite) when the app's requested redirect isn't on the allow-list, and that Site URL is still `localhost:3000`. Richard reported his own password reset wasn't working and he didn't know his password; as a workaround, a temporary password was set directly via SQL for his account (`rwsmith964@gmail.com`) and login was live-verified. See **D-168**. This dashboard setting still has no reachable tool/API from this session — Richard needs to fix it himself: Supabase dashboard → project `moblcysnsaxohnslubym` → Authentication → URL Configuration → set **Site URL** to `https://lifeos-seven-rho.vercel.app` and add that same URL under **Redirect URLs**. Until that's done, password-reset and magic-link emails will keep sending users to `localhost:3000` instead of the live app for every account, not just Richard's.

---

## HIGH

(none open)

## MEDIUM

## LOW

## Q-006 | Golf activity / stray location | Priority: LOW | Opened 2026-08-31
**Question:** While building D-095 (multi-location activities), found that the Golf activity already had a second, previously-hidden location row whose name is literally `"Eugene, Oregon"` (likely a leftover from an early geocode-on-save fallback, before there was any UI to see or manage it). It's now visible and editable/removable on the Golf edit page under "Other locations." Want it renamed to an actual course name, or removed? Left as-is since it's your real data, not mine to guess at.

## Q-005 | daily brief / "look-ahead" | Priority: LOW | Opened 2026-08-30
**Question:** An early backlog line mentioned a "look-ahead" for the daily brief, but the detailed wording wasn't recoverable from the repo or session history when this was picked up. What should "look-ahead" mean here — a longer brief event window (e.g. showing the next 3-5 days, not just today/tomorrow), a weekly preview section, or something else? Everything else on that same backlog line (markdown rendering, seeing-them-today suppression, People-link tappability) was concrete enough to build without asking and is done (D-048).

---

## Resolved

## QUEUE-018 | Module 4 / Scheduling Intelligence | Priority: MEDIUM | Resolved 2026-09-03
**Question:** When a LifeOS-native event that was previously pushed to a CalDAV account is later deleted locally, should the remote copy be deleted too?
**Answer:** Yes. Shipped as **D-156**: `propagateDeleteToRemote()` in `lib/calendar/two-way-sync.ts`, called from `deleteCalendarEventAction()` after the local delete, using the adapter's existing `deleteRemoteEvent()`. Best-effort/never-throws, matching pull/push sync's failure posture. `restoreCalendarEventAction()` (Undo) was also fixed to clear the sync-tracking fields on a recreated row so Undo doesn't leave an event permanently un-pushed.

## QUEUE-011 | Module 3 / Universal Intake + Trust Layer | Priority: MEDIUM | Resolved 2026-09-03
**Question:** Module 3's backend (drafts table, action log, review-queue approve/reject/correct functions, verified-completion wiring into Quick Capture, weekly digest builder) was done, tested, and merged, but no page/UI surfaced the review queue, the action log/undo, or the weekly digest.
**Answer:** Review queue Approve/Reject UI shipped earlier as **D-136** (correction UI deferred separately as QUEUE-039, now also resolved — see below). The remainder — action-log/undo and the weekly-digest view — shipped as **D-157**: a new `/settings/activity` route (matching the digest notification's own `linkPath`) rendering "This week" (via the existing `buildWeeklyDigest`) and "All activity (last 30 days)" with a generic `reverseAction()` undo (owner/adult only, gated the same way as every other destructive action), plus a Settings-page link so the route is reachable from the nav.

## QUEUE-039 | Universal Intake UI (D-136) | Priority: MEDIUM | Resolved 2026-09-03
**Question:** The review queue only offered Approve-as-extracted or Reject. `correctDraftFields` (fix a misread field before approving) already existed in the backend but nothing called it — should the next pass add inline editing, and if so, per-record-type forms or a generic key/value editor? (This item originally also bundled a feature-flag-admin-UI question, now split out as open item QUEUE-047.)
**Answer:** Shipped as **D-158**: a "Correct" button on every actionable draft card opens an edit mode with a record-type select and one input per extracted field (text/textarea/number/date/datetime/checkbox/select, chosen per field key via a new `inputSpecForField` lookup), pre-filled with the AI's original values. Save submits only changed fields (plus the record type if changed) through a new `correctIntakeDraftAction` calling the existing `correctDraftFields`. A generic key/value editor was effectively chosen over bespoke per-record-type forms — one field-metadata table drives every record type's form instead of eight separate layouts.

## QUEUE-002 | Module 1 / Relationship & Gift Engine person-detail UI | Priority: MEDIUM | Resolved 2026-09-03
**Question:** Module 1's backend (6 new tables + gift pipeline stages, all flagged off) was done, tested, and merged, but no person-detail-page UI surfaced any of it (profile details, wishlist, relationships, conversation log, moments, reciprocity ledger).
**Answer:** Shipped as **D-159**: six new `<Card>` sections on the person-detail page (`app/(app)/people/[id]/page.tsx`), gated by `isFeatureEnabled(..., "relationship_gift_engine_v2")` without a route-level `notFound()` since it's one section among many on an existing page. New client-forms file `relationship-gift-engine-forms.tsx` (729 lines) covers all six sections following the sibling `person-forms.tsx` conventions exactly. A new `RECIPROCITY_DIRECTION_DISPLAY_LABELS` map keeps the ledger's direction field human-readable. Confirmed via direct SQL that the flag is already enabled for the household with real data, so the shipped UI is reachable in production immediately. `relation_label`'s free-text-vs-enum question is split out as new open item QUEUE-048.

## Q-004 | shell layout / desktop-tablet | Priority: MEDIUM | Resolved 2026-09-03
**Question:** The whole app shell is intentionally a narrow ~448px mobile-width column, centered with large unused margins on tablet/desktop. Should LifeOS ever get a real multi-column desktop layout, or is "phone-shaped app centered on desktop" fine indefinitely?
**Answer:** Build a real desktop layout (Option A). Shipped as D-101 (persistent sidebar at `lg`+, `max-w-6xl` content container, People/Calendar as multi-column grids, mobile unchanged); re-confirmed live in production by D-155 after Richard re-approved the same direction.

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

### QUEUE-047 — RESOLVED (D-138)
**Module:** Feature-flag administration (all Modules)
**File(s):** `app/(app)/settings/feature-flags.tsx` (`FeatureFlags` component), `app/(app)/settings/page.tsx`.
**Question:** Split out of QUEUE-039 once its inline-correction half shipped as D-158 (see Resolved section) — this half is unrelated and still open. No flag-toggle UI exists anywhere in the app for any of the eight Module feature flags. Should Settings get an admin toggle panel for household owners?
**Assumption made:** None yet — genuinely deferred, no autonomous guess made either way.
**Reversal cost:** Low — a flag-toggle settings panel is additive and doesn't change any flag's current value.
**Blocking:** No
**Resolution:** Already shipped as **D-138** ("in-app feature-flag management", Settings > Modules) — `FeatureFlags` component wired into the Settings page, gated by `canManage` (owner/adult). Confirmed via `git log` (`a48caa8`, merged `e430d82`). Entry left unmarked in this file until now; no further work needed.

### QUEUE-048 — RESOLVED (D-162)
**Module:** Module 1 / Relationship & Gift Engine person-detail UI (D-159)
**File(s):** `app/(app)/people/[id]/relationship-gift-engine-forms.tsx` (`AddRelationshipForm`), `lib/db/database.types.ts` (`PersonRelationshipRow.relation_label`).
**Question:** `relation_label` on a person relationship is free text with a `<datalist>` of common suggestions (spouse/partner/child/co-parent/parent/sibling/extended family/friend/colleague) rather than a closed enum. Free text was the fastest way to ship without blocking on every possible label a household might use, but a closed set could matter later if reporting, filtering, or gift-suggestion logic ever wants to reason about relationship type structurally (e.g. "show gift ideas grouped by relationship").
**Assumption made:** Shipped free text with suggestions, matching the underlying schema (`related_name`/`relation_label` are both required free-text columns per D-117, unchanged this session). Did not add an enum column or migrate existing data.
**Reversal cost:** Low today (no real data yet to migrate) but grows over time — the longer relation_label stays free text, the more real household data would need to be normalized into any future closed set.
**Blocking:** No
**Resolution:** Richard confirmed a closed set. Added a `person_relationships_relation_label_valid` check constraint restricting `relation_label` to the same nine categories plus `other`; replaced the free-text input + datalist with a required `<select>`. See D-162.

### QUEUE-040 — RESOLVED (D-162)
**Module:** Demographic interest suggestion bubbles (D-137)
**File(s):** `lib/db/database.types.ts` (`PersonRow`), `lib/people/demographic-interests.ts`.
**Question:** Richard's request explicitly said "age, gender, general demographics," but `PersonRow` has no gender field — only `birthdate`/`birth_year_known` and `relationship_type` exist. Should a gender field be added to `people`, and if so, is it a free-text field, a fixed enum, or an optional/skippable field (given real sensitivity around collecting gender for children in particular)? The current bubbles deliberately avoid gendering suggestions (e.g. the young-child bucket lists Spiderman and Paw Patrol together, not split "boy"/"girl" lists) so no gender data is required at all.
**Assumption made:** Shipped age + relationship_type as the demographic signal, with non-gendered suggestion lists per age bucket. Did not add a gender column speculatively — that's a schema change with its own privacy/compliance surface (this app is already tracking App Store / Play Store data-safety disclosures per the launch-prep workstream) that deserves an explicit decision rather than a silent addition.
**Reversal cost:** Medium — adding a gender field later is an additive nullable column (cheap schema-wise), but re-splitting the curated suggestion lists by gender, deciding the UI for an optional/skippable field, and updating the privacy/data-safety disclosure docs already drafted for the app stores is real follow-up work, not a one-line change.
**Blocking:** No
**Resolution:** Richard confirmed a closed set (not free text). Added a nullable `people.gender` column with a `people_gender_valid` check constraint (`female`/`male`/`non_binary`/`prefer_not_to_say`), always optional/skippable including for children. Added a `<select>` to the person create/edit forms. Updated `/privacy`, the Apple App Privacy draft, and the Play Data Safety draft to disclose it. The demographic-interest suggestion bubbles remain non-gendered — gender is not wired into `demographic-interests.ts` — this closes only the schema/UI half of the original question. See D-162.

### QUEUE-041 — RESOLVED (D-161)
**Module:** Itinerary-aware trip planning / flight intake cascade (D-142, roadmap R-1)
**File(s):** `lib/intake/trip-cascade.ts` (`DEFAULT_TSA_BUFFER_MINUTES`).
**Question:** Should the TSA security-cutoff buffer (currently a hardcoded 120-minute constant applied to every flight) be configurable per household or per person — e.g. a household with young kids or TSA PreCheck might reasonably want a longer or shorter buffer than the default?
**Assumption made:** Shipped a hardcoded `DEFAULT_TSA_BUFFER_MINUTES = 120` (2 hours, a standard domestic-flight recommendation) rather than adding a settings column speculatively — same posture as QUEUE-007's confidence threshold. `computeTripCascade` already accepts an optional `tsaBufferMinutes` override parameter, so wiring a per-household setting through later is additive (new nullable column + one call-site change), not a rework.
**Reversal cost:** Low — the function signature already supports an override; this is purely "add a settings field and pass it through," no cascade-logic changes needed.
**Blocking:** No
**Resolution:** Added a nullable `households.tsa_buffer_minutes` column (0-600 check constraint) and a Settings field ("TSA buffer for flights (minutes)", blank = default). `lib/intake/convert.ts` now passes `household.tsa_buffer_minutes` through to `computeTripCascade` when set, falling back to `DEFAULT_TSA_BUFFER_MINUTES` (120) when null — no change to the cascade function itself, exactly the additive path this entry anticipated. See D-161.

### QUEUE-042
**Module:** Onboarding household creation / timezone-date bug (D-143)
**File(s):** `app/onboarding/actions.ts` (`createHouseholdAction`, birthdate future-date check, ~line 36).
**Question:** D-143 fixed every other server-side "what day is today" call site to use the household/user's stored `users.timezone` column via `getZonedNow()`. This one spot can't use that pattern: the household (and the user's `timezone` row, which defaults server-side to `America/Los_Angeles` but isn't necessarily the visitor's real zone yet) is being created inside this very function, so there's no reliable stored timezone to read yet. Should the onboarding form pass the browser's `Intl.DateTimeFormat().resolvedOptions().timeZone` through a hidden field so this check (and the new user's initial `timezone` value) use the visitor's real zone from the very first request, instead of relying on the `America/Los_Angeles` column default until they change it later in Settings?
**Assumption made:** Left this one call site on `new Date()` rather than fixing it, since a real fix needs a client→server timezone handoff (a hidden form field wired through the onboarding form and action), which is bigger than "swap in the existing helper" like every other D-143 site. The practical impact is narrow: a birthdate exactly "today" in a zone west of UTC could, in the same evening-after-UTC-midnight window as the original bug report, be rejected as one day in the future on this one onboarding form — everywhere else in the app (editing a person later, the calendar, the brief) is already fixed.
**Reversal cost:** Low — additive hidden form field + one call-site change once decided; doesn't touch any other D-143 file.
**Blocking:** No

### QUEUE-043 — RESOLVED (D-144)
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

### QUEUE-045 — RESOLVED (D-164)
**Module:** Database performance / RLS policy layer (all modules — cross-cutting)
**File(s):** `supabase/migrations/20260904000003_rls_performance_advisor_fixes.sql`;
`supabase/tests/pglite/rls.test.ts` (30 new regression tests added first, across 6 new
`describe` blocks, before writing the migration).
**Resolution:** Richard: "yes expand RLS test coverage and fix any performance issues." Added
regression coverage for the six tables/policy-areas that had none (`users`, `device_tokens`,
`external_data_cache`, `gift_shipping_windows`, `brain_dump_batches`, `household_members` DELETE),
confirmed the full 117-test RLS suite passed against the pre-migration policies as a baseline,
then wrote and applied a migration that: (1) wraps every literal `auth.uid()`/`auth.jwt()` in
the 18 `auth_rls_initplan`-flagged policies (9 tables) in `(select auth.uid())`; (2) splits the
`FOR ALL` owner/adult-manage policies on `assistant_email_config`, `contact_execution_settings`,
and `execution_categories` into INSERT/UPDATE/DELETE-only policies so SELECT is governed by
exactly one policy; (3) merges `household_members`' two DELETE policies (self-leave,
owner-removes-member) into one OR'd policy. Re-ran the full suite locally post-migration
(117/117 RLS tests, 832/832 overall) before applying to production. See D-164 for full detail.
**Verified:** Migration applied to production Supabase (`moblcysnsaxohnslubym`) after explicit
confirmation; `get_advisors` (type=performance) re-run post-migration confirms both
`auth_rls_initplan` and `multiple_permissive_policies` findings are gone. Only unrelated,
pre-existing INFO-level `unindexed_foreign_keys`/`unused_index` findings remain, out of scope.
**Reversal cost:** Low — every original policy's `qual`/`with_check` text is preserved verbatim
in D-164 and in `pg_policies` history.
**Blocking:** No.

### QUEUE-046 — GREENLIT, design amended (D-163), not yet implemented
**Module:** Cross-household sharing design (D-149, amended D-163) — DECISIONS.md, no code/schema/UI changed.
**File(s):** none changed — this is a design-doc scoping note. Would affect a future implementation of `household_link_consents`, `household_link_availability_probes`, `household_link_invites`, and the associated RLS policies described in D-149.
**Question:** D-149 proposes an initial v1 category set (`calendar`, `custody_schedule`, `people_basic`, `activities`, `availability`) for cross-household sharing, based on what the app already models. This is not a locked spec — it's a reasonable starting taxonomy, not something the user explicitly confirmed. Two things a future implementation pass needs a decision on that this design doc intentionally left open: (1) which category (or categories) to build first — `calendar` is the cheapest to extend since `household_links`/`is_linked_household_member` already exist, but `availability` is likely the most user-facing valuable one and needs a new RPC, rate-limit table, and probe log from scratch; (2) whether `custody_schedule`'s per-child `scope` column (proposed as `jsonb`, nullable = "all applicable") is the right shape, or whether custody-relevant sharing should instead be derived automatically from existing custody-block child assignments rather than requiring a separate manual scope selection.
**Assumption made:** None yet — no implementation started. The design doc flags this as an open question for whoever picks up the implementation pass, per the standing instruction to log rather than block on every open design choice.
**Reversal cost:** N/A — design-only, nothing built.
**Blocking:** No. This does not block Part 5 or any other queued work.
**Update (D-163):** Richard reviewed and greenlit the design's core principle (explicit opt-in per category, choose who to share with). D-149's model already supported per-recipient selection structurally (consent is per link, and a household can have multiple links); the one gap — a "share all" shortcut — was added as a design amendment (per-link "share everything with X" and per-category "share with all linked households," both as convenience wrappers around the same per-category grant path, not new consent semantics). Which category ships first and the custody per-child `scope` shape remain open per the original question above. Still design-only — implementation has its own dedicated branch/session when Richard asks to start it.

### QUEUE-049
**Module:** Module 2 / Leisure Planner — `activity_type_viability_configs` (surfaced while implementing D-165 / QUEUE-006)
**File(s):** `activity_type_viability_configs` table, `lib/planner/viability-gate.ts`
**Question:** Richard's original QUEUE-006 framing implied numeric threshold-based gating (his example: "hide fishing when river flow crosses X"). The existing `activity_type_viability_configs` schema only stores `relevant_inputs text[]` — which condition categories matter for an activity type — with no threshold/value fields at all. Should a future pass add per-input threshold configuration (e.g. a minimum/maximum acceptable river-flow value, tide range, etc.), or is "exclude when a declared data source is entirely missing for the location" (what D-165 actually implemented) sufficient?
**Assumption made:** D-165 implemented the best-faithful interpretation achievable without a schema change — gating on data-source presence/absence, not on any numeric value — since inventing a threshold schema and matching UI unprompted would be a much larger, unrequested feature. Left as an open question rather than guessing at threshold ranges/units per activity type.
**Reversal cost:** Medium — would need a new table or jsonb column for per-config threshold values, a UI to set them per activity type, and comparison logic in `viability-gate.ts`; additive, no existing behavior needs to change to add it.
**Blocking:** No.

---

## Audit Pass (2026-09-11) — full defect and UX audit

Entries below use the format specified for this pass: `Task` (item ID), `Files`, `Question`,
`Assumed`, `Reversible`, `Confidence`. Logged instead of stopping to ask — a reasonable decision is
made and implemented in every case, then noted here. See `AUDIT-MAP.md` for the file-ownership map
and `PROGRESS.md` for per-item status.

### Q1 — B-02's exact 503 root cause is unconfirmed

- **Task:** B-02
- **Files:** `proxy.ts`, `app/(app)/layout.tsx`, `app/error.tsx` (new), `app/(app)/error.tsx`, `lib/hooks/use-auto-retry-once.ts` (new)
- **Question:** The audit reports intermittent 503s on `/`, `/activities`, `/notifications`, and a calendar month URL in one session. I have no access to Vercel function logs or Supabase project metrics from this sandbox, so I could not directly observe an actual 503 or confirm which of several plausible causes is the real one.
- **Assumed:** Made the code more resilient against every plausible cause I could identify rather than guessing at one: (1) `proxy.ts` calls `supabase.auth.getUser()` on *every* navigation and RSC prefetch for *every* route with no try/catch — a transient failure there would throw out of the whole middleware invocation and could explain why unrelated routes failed together in the same session; wrapped it in try/catch, falling back to letting the request through (each protected layout already re-checks auth itself, per the file's own existing comment). (2) `app/(app)/layout.tsx` called `listUnreadNotifications` directly in the layout body with no error handling — since a layout's own error can only be caught by an error boundary in a *parent* segment (not `app/(app)/error.tsx`, which only catches errors from the layout's children), any transient failure there previously escaped all the way to the bare `app/global-error.tsx`. Wrapped it in try/catch, defaulting to an empty notification list (cosmetic — just the bell badge) rather than taking down every page. (3) Added a new `app/error.tsx` as a styled intermediate backstop specifically for the (app)-layout case, so if something in that layout genuinely does fail, the user sees the real design system instead of the bare fallback. (4) Added a shared `useAutoRetryOnce` hook, wired into both `app/(app)/error.tsx` and the new `app/error.tsx`, that silently retries once (~700ms) before showing any error UI at all, per the audit's explicit ask.
- **Reversible:** Yes — every change is additive/defensive (try/catch around existing calls, a new intermediate error boundary, an opt-in retry hook). None of it changes normal-path behavior.
- **Confidence:** Medium — the fixes are well-reasoned responses to the *symptom* (cross-cutting, intermittent request failures) and directly address the two concrete code paths that could turn a transient blip into a full failure, but without production log access I can't certify which one (if either) was the actual cause, or rule out something else entirely (e.g. an actual Supabase/Vercel-side rate limit or cold-start issue outside the app's own code). Recommend Richard check the Vercel function logs and Supabase project's API/auth request metrics around the timestamps in the original audit session if the 503s recur after this fix.

### Q2 — M-03: "Fritz is missing" is a display-name inconsistency, not an exclusion bug

- **Task:** M-03
- **Files:** `lib/people/display-name.ts` (new), `lib/db/repositories/people.ts` (read only, confirmed correct), ~20 picker/list files (see PROGRESS.md)
- **Question:** The audit's premise was that different screens query different people rosters (one excluding Fritz and "Richard Frederick Smith"). I queried the real `people` table directly (via a temporary script using the service-role key already in `.env.local` — deleted after use, not committed) to check.
- **Assumed:** Confirmed there is only ONE household roster query (`listPeopleForHousehold` in `lib/db/repositories/people.ts`), already documented in its own comment as the canonical source every screen should use, and it is genuinely used everywhere (pickers, People list, etc.) — there is no second, more restrictive query excluding anyone. "Richard Frederick Smith" and "Fritz" are the **same row** (`full_name = "Richard Frederick Smith"`, `nickname = "Fritz"`) — he is not missing from People (he shows there as "Fritz — Parent," already visible earlier this session), he just displays under a different name form in pickers that rendered raw `person.full_name` instead of applying the nickname-first convention every other screen uses. That inconsistency — not an exclusion bug — is the real, fixed issue (see M-03 in PROGRESS.md for the full file list). Separately, "Richard Smith" (no nickname) showing up in some picker lists is the account owner's own `self` row; `listPeopleForHousehold`'s existing `excludeSelf` option is already applied correctly where it matters (e.g. the calendar event attendee picker — you're implicitly on your own calendar) and left available (selectable) in pickers like chores/dietary where assigning something to yourself is a real use case.
- **Reversible:** Yes — every change is a display-string swap (`person.full_name` → `personDisplayName(person)`), no query or schema change.
- **Confidence:** High that the roster-query premise was wrong (verified against real data). Medium-high that display-name consolidation is the complete fix for the *reported symptom* — I migrated every picker/list/label call site I found still using a raw `full_name`, but did not touch the handful of contexts where the full legal name is arguably still correct on purpose (the edit form's own "Full name" input `defaultValue`, "Archive {full_name}" confirmation copy, and the Module 6 Execution screens, which are unreachable/flagged-off per Phase 5's A3 finding and so out of scope for this pass).

### Q3 — M-01: systematic audit found 16 more real timezone bugs

- **Task:** M-01
- **Files:** see the per-item file list in the agent report this entry summarizes; fixed in this pass: `lib/custody/materialize.ts` + 4 callers, `app/api/calendar/custody/schedules/[id]/ics/route.ts`, `app/(app)/calendar/custody/[id]/page.tsx`, `app/(app)/calendar/custody/page.tsx`, `app/api/calendar/conflicts/route.ts`, `app/ambient/page.tsx`, `app/(app)/settings/page.tsx`, `lib/planner/generate.ts`, `lib/opportunities/detect.ts`, `lib/db/repositories/gifts.ts` (`listSuggestionsDueForOrder`) + `lib/brief/generate.ts`.
- **Question:** After fixing the person-detail page, I ran a systematic sweep of every `new Date()`/`Date.now()`/bare-date call site in the repo (excluding tests) to find the rest of this bug class, per the task's own instruction. It found 16 genuine instances, several with real, specific user-visible consequences beyond "day off by one" — most notably: `lib/custody/materialize.ts`'s `windowStart = new Date()` is very likely the actual root cause of D-04 (Tuesday showing 4 overlapping custody blocks instead of 2) — two mutations to the same schedule (e.g. an exception add, then a later edit) that straddle a UTC-midnight rollover compute two *different* `windowStart` days; the first call's delete-then-recreate clears day N, but the second call computes `windowStart` = day N+1 and never deletes day N's rows before re-inserting, leaving duplicates. Should I fix all 16, or only the ones with a clear, contained blast radius?
- **Assumed:** Fixed 13 of the 16 — everything where the fix was either a direct `new Date()` → `getZonedNow(timezone)` swap with `timezone` already in scope (11 sites: the custody family, calendar conflicts, ambient display, Settings), or a small, well-contained signature change to an existing optional-parameter pattern already used elsewhere in this codebase (`today: Date = new Date()` → `today?: Date` with an internal fallback, matching `lib/brief/generate.ts`'s own established convention) for the weekend-planner cron, the opportunities-detection cron, and the brief's gift-order-by-date reminders (this last one directly matters for M-08: past-due reminders). Left 3 for a follow-up (see Q3 continuation below) because each needs a `timezone` parameter threaded through 1-2 more call-chain layers than a single function's own signature, and I wanted to keep this batch reviewable rather than touching every intake/capture code path in the same sweep: the AI daily-spend budget reset (`lib/db/repositories/system.ts`'s `sumAiSpendToday`, called from `lib/ai/client.ts`), Quick Capture/Brain Dump's AI date context (`app/api/capture/route.ts`, `app/api/brain-dump/parse/route.ts`, `lib/ai/capture-actions.ts`), and Universal Intake's default occasion/moment dates (`lib/intake/convert.ts`). Also intentionally left `app/onboarding/actions.ts`'s birthdate check alone — it's the household-creation flow itself, before any timezone row exists yet, already logged as QUEUE-042 in a prior engagement with the same reasoning.
- **Reversible:** Yes for all 13 — every change is either passing an already-computed zoned value into an existing optional parameter, or moving an existing lookup a few lines earlier in a function (no new query added, no schema change).
- **Confidence:** High for the custody-materialization fix specifically (the mechanism cleanly explains the exact reported symptom). Medium-high for the rest — each is a real, defensible improvement, but see Q4 below for a genuinely important nuance I found while making these fixes that affects how "correct" the day-boundary values are in absolute terms, not just which calendar day they name.

### Q4 — `getZonedNow` is safe for calendar-day math, NOT for real-instant range queries — a deeper, pre-existing, app-wide characteristic

- **Task:** M-01 (discovered while fixing it, not something the audit named)
- **Files:** none changed for this finding itself — it's a discovered property of `lib/timezones.ts`'s `getZonedNow`, already used throughout the app before this session
- **Question:** While fixing the custody/conflicts call sites above, I verified empirically (a throwaway script, `TZ=UTC node ...`, matching Vercel's actual runtime) exactly what `getZonedNow(timezone)` returns: a `Date` whose UTC-read calendar/clock fields equal the household's local wall-clock time, but whose actual real-world instant (`.getTime()`/`.toISOString()`) is shifted by the zone's UTC offset (e.g. ~7-8 hours for `America/Los_Angeles`). That's exactly right for date-fns calendar-day functions (`startOfDay`, `format(..., "yyyy-MM-dd")`, `isSameDay`) — but if the *same* value's `.toISOString()` is then used directly in a `.gte()`/`.lte()` comparison against a real `timestamptz` column (as opposed to a plain `date` column), the comparison is off by the zone's offset in real terms, not just "which calendar day." I found this pattern already in use, unquestioned, in code that predates this session (e.g. the Today page's `windowStart = startOfDay(getZonedNow(timezone))` fed straight into `listEventsInRange`/`listCustodyBlocksForHouseholdInRange`, both real `timestamptz` range queries) — so this isn't something I introduced, it's a pre-existing, systemic characteristic of how `getZonedNow` has been used everywhere so far. `date-fns-tz` does export the inverse conversion (`fromZonedTime`, wall-clock → true UTC instant) that would fix this properly, but it is used *nowhere* in this codebase today.
- **Assumed:** Did NOT attempt a codebase-wide fix (swapping every `timestamptz`-range-query day-boundary over to `fromZonedTime`) — that's a materially larger, cross-cutting change than this audit pass scoped, and rushing it risks new regressions in already-working, already-tested range queries. For my own new fixes in this pass, I matched the app's existing (imperfect but consistent) convention rather than inventing a new, unprecedented pattern in just one or two files — i.e. I used `getZonedNow(timezone)` the same way the rest of the app already does, which is a **real, meaningful improvement** over the bug being fixed (getting the *calendar day* right, which was completely wrong near a midnight-UTC rollover) even though it doesn't close this smaller, pre-existing, few-hours-of-real-instant imprecision. One exception: the custody hub page (`app/(app)/calendar/custody/page.tsx`) previously mixed a real instant (`new Date()`, correct for its `timestamptz` blocks-range query) with the same value reused for a date-string time-off query (needing the local calendar day) — I unified both onto the zoned value for consistency with the rest of the app, accepting the same small instant-precision trade-off documented here rather than leaving the file internally inconsistent.
- **Reversible:** Yes, but only as a real project: introducing `fromZonedTime` correctly would need per-call-site judgment about which values are "calendar day" concepts (keep `getZonedNow`) vs. "real instant boundary" concepts (convert via `fromZonedTime`) — worth a dedicated pass with its own review, not a quick follow-on to this one.
- **Confidence:** High that the characterization above is technically correct (verified empirically, not just reasoned about). Medium on whether it's worth fixing soon — the practical impact is bounded to events/blocks within a few hours of local midnight being occasionally mis-bucketed across a day boundary, which is a real but narrow-impact edge case for a personal household calendar, not a "data is wrong most of the time" issue.

