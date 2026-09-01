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
