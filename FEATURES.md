# FEATURES.md

Phase 0 inventory for the "Competitive Parity + Moat Extension" build brief. Produced by direct
reads of the repository (migrations, `lib/`, `app/`) plus four read-only inventory passes — no
guessing. This document is the baseline snapshot before any Module 1–8 work begins.

Repo: `/home/user/workspace/lifeos`. HEAD at time of writing: `bc151c6` ("Document D-114...").

---

## 1. Existing User-Facing Capabilities

For each capability: what it does, routes/endpoints, tables read/written, key service/helper
functions, test coverage, and feature-flag status (none exist yet — see §3).

### 1.1 Auth & Household Context
- **What:** Supabase-Auth-backed login, household membership, active-household resolution.
- **Routes:** `/login`, `/onboarding`, every `(app)/**` page/layout (gated).
- **Tables:** `users`, `households`, `household_members` (name inferred from session-auth reads),
  `people`.
- **Functions:** `lib/auth/session.ts` → `requireHouseholdContext()` (memoized per-request via
  React `cache()`); resolves user → household memberships → active household
  (`users.active_household_id` preferred, else oldest membership) → "self" person row.
- **Tests:** covered indirectly across most `(app)` route tests; no dedicated session unit test
  file identified in this pass.
- **Flags:** none — always on.

### 1.2 People / Relationship Records
- **What:** Household member and non-member "person" records (kids, co-parents, friends,
  childcare providers), interests, cadences, interaction logging.
- **Tables:** `people` (incl. `is_childcare_provider`, `address`/`address_lat`/`address_lng`,
  `show_work_schedule_on_calendar`), `person_interests` (interest/category/strength/source tags
  only), `contact_cadences`, `interactions` (`person_id`, `interaction_type` enum, `occurred_on`,
  nullable `notes`, `activity_id`).
- **Functions:** `logInteractionAction` (hardcodes `interaction_type: "in_person"`, `notes` never
  populated in practice).
- **Gaps found (feeds Module 1):** no food preferences/restrictions, sizes, brands, "mentioned
  wanting" list, family/relation graph, or "how we met" field — only a single free-text
  `people.notes` catch-all. No real conversation log (notes field on `interactions` unused). No
  retrospective "moments" concept (`trip_ideas` is the closest analog but is prospective/bucket-list
  only, lives under Activities not People).
- **Tests:** `contact_cadences`/`interactions` overdue-nudge logic is tested; conversation-log/
  moments have no tests because they don't exist.
- **Flags:** none.

### 1.3 Gifts
- **What:** Gift idea suggestions, shipping-window-aware "order by" deadline computation, marking
  gifts given.
- **Tables:** `gifts` (`status` enum `idea/chosen/ordered/delivered/given` — **vestigial**, only
  `given` is ever written per code comment, `lib/gifts/convert.ts:6-11`), `gift_suggestions`
  (**real working lifecycle**: `suggested → saved → ordered → dismissed/converted_to_gift`, set via
  `updateSuggestionStatusAction` in `app/(app)/gifts/actions.ts`), `gift_shipping_windows` (7 seeded
  categories with `shipping_window_days`).
- **Functions:** `lib/gifts/leadtime.ts` (`computeOrderByDate`, `computeGiftPromptDate`,
  `isPastPromptDate`, `orderByStatusLabel`) — fully implemented and wired into
  `lib/gifts/suggest.ts` / `lib/gifts/scan.ts`. `lib/gifts/occasions.ts` — real occasion detection
  (birthdays/anniversaries/Christmas rolled forward using household's `gift_scan_horizon_days`).
  `undoMarkGivenAction` (client-side reversal of a status change, not a persisted log).
- **Gaps found (feeds Module 1):** brief's 7-state `idea → shortlisted → decided → ordered →
  shipped → arrived → given` pipeline does not exist — would need new work extending
  `gift_suggestions`, not `gifts`. No reciprocity tracking at all (only an unused
  `gifts.given_by_person_id` column; no received/promise/IOU concept). Three lead-time knobs
  (`gift_prompt_buffer_days`, `gift_handling_buffer_days`, `gift_personal_buffer_days`) exist in DB
  and are consumed by code but have no Settings UI (only `gift_scan_horizon_days` does).
- **Tests:** `lib/gifts/leadtime.test.ts`, occasion-detection tests exist; reciprocity/pipeline
  extension has none because they don't exist yet.
- **Flags:** none.

### 1.4 Leisure / Activity Planner
- **What:** User-defined recurring activities (fishing, golf, etc.), live condition-data fetches,
  a composite viability score, proactive plan generation.
- **Tables:** `user_activities` (`activity_type` is **free text**, not an enum/declarative model),
  `activity_seasonality_daylight` fields (D- migration), `trip_ideas` (bucket-list, prospective),
  `opportunities` (daily-cron, rolling 7-day scan, up to 5 actionable rows with dismiss/act-on),
  `weekend_plans` (weekly Wed cron, single next-Saturday recommendation + 2 alternates).
- **Functions:** Live external providers — `lib/external/usgs.ts` (river flow), `lib/external/
  noaa-tides.ts`, `lib/external/odfw.ts` (HTML scrape — most brittle), `lib/external/solunar.ts`
  (via suncalc) — all real, not stubs. `lib/planner/score-candidate.ts` — 5-component weighted
  score (`weatherSuitability 0.30`, `conditionData 0.25`, `travelFeasibility 0.15`,
  `enjoymentFit 0.20`, `recencyPenalty 0.10`) computed in `lib/planner/scoring.ts`.
  `lib/planner/companions.ts` — static `preferred_companions` list checked against cadence
  overdue-ness (not a dynamic relationship-graph query).
- **Gaps found (feeds Module 2):** `conditionDataScore` is **deliberately hardcoded to `null`**
  (`score-candidate.ts:58`, per D-020 — no verified domain thresholds available), so it always
  falls back to a flat neutral 50 — live fishing/tide/solunar data currently has **zero numeric
  effect** on the score, narrative text only. The `breakdown` object is computed but used in
  exactly one place (`detect.ts:144`, internal filter) — never persisted, never shown in UI, so
  users see a bare "87/100" with no visible confidence. No activity-type-declares-viability-inputs
  system — fishing-relevance is inferred ad hoc from whether a *location* has
  `external_ids.usgs_gauge`/`odfw_zone_url` set. No dynamic who-to-invite from the relationship
  graph. No gear checklists at all. Post-outing capture is a single `last_done_at` timestamp, no
  conditions/companions/rating/notes object.
- **Tests:** external providers individually well-tested; scoring/breakdown persistence has no
  tests because it isn't persisted.
- **Flags:** none.

### 1.5 Universal Intake (Brain Dump / Quick Capture / Custody-Agreement Parser)
- **What:** Three separate free-text AI capture surfaces.
- **Routes:** `app/api/brain-dump/parse` + `/execute`, `app/api/capture`, `app/api/calendar/
  custody/parse-agreement`.
- **Tables:** `brain_dump_batches` (`transcript`, `parse_status`, `items jsonb`, `saved_count`).
  Quick Capture and Brain Dump both ultimately write through `lib/ai/capture-actions.ts`'s
  `executeAction()` into `calendar_events`, `people`, `gifts`, `time_off_entries` (tagged
  `source: 'quick_capture'`), etc.
- **Gaps found (feeds Module 3):** No numeric/graded confidence score anywhere — the only
  uncertainty signal in the whole pipeline is `item.eventDateApproximate`, a **boolean**, shown
  only for calendar-event dates. Brain Dump has a genuine all-or-nothing per-item review gate
  (nothing written until the user clicks Save); Quick Capture commits directly except for a single
  missing-required-field clarification gate (presence/absence, not confidence-graded). Quick
  Capture's `confirmationMessage` (`"Saved — ..."`) is the **AI model's own pre-write summary**
  echoed back, not a fresh DB read of what was actually persisted (`app/api/capture/route.ts`
  ~line 205) — an unverified-completion gap. No image, PDF, or inbound-email intake exists
  anywhere (`"inbound"` is zero repo hits; Resend is outbound-only).
- **Tests:** none dedicated to `brain_dump_batches`; `lib/ai/parse-json.test.ts` covers JSON
  parsing generically.
- **Flags:** none.

### 1.6 Calendar & Custody Scheduling
- **What:** Household calendar events, recurring custody schedules with exceptions, per-day
  handover-time overrides, one-way `.ics` feed subscription import, one-way `.ics` custody export.
- **Tables:** `calendar_events`, `event_attendees`, `custody_blocks`, `custody_schedules`
  (`cycle_assignments jsonb`, `custom_handover_times jsonb`), `custody_schedule_exceptions`,
  `calendar_feeds`, `work_schedules`, `time_off_entries`.
- **Functions:** `lib/custody/conflicts.ts` → `detectCustodyWorkConflicts()` — **strict literal
  half-open-interval overlap only**, confirmed by grep to neither import nor call
  `lib/external/travel.ts` anywhere in the file. `lib/calendar/feed-sync.ts` → `syncCalendarFeed()`
  — confirmed one-way (external `.ics` → `calendar_events`, tagged `event_type: "external"`), no
  OAuth, no provider-specific code, no write-back in either the on-demand (Settings action) or
  cron (`app/api/cron/calendar-sync`) trigger path. `lib/custody/ics.ts` — one-time static `.ics`
  *export* of a custody schedule (unrelated code path, not sync).
- **Gaps found (feeds Module 4):** No travel-time-aware conflict detection despite
  `lib/external/travel.ts` (Google→Mapbox→haversine fallback chain) being a real, tested module
  actively used elsewhere (briefs, childcare drive-time, trip planner) — `conflicts.ts` simply
  never calls it. Calendar sync is genuinely one-way only; no Google/Apple/Outlook write-back of
  any kind exists. No preference-memory system anywhere (quiet hours, cadence, framing,
  response-priority) — repo-wide search for "preference" returns only two incidental
  daily-brief-opt-in code comments, unrelated.
- **Tests:** `lib/custody/conflicts.test.ts`, `lib/custody/schedule.test.ts`, `lib/calendar/
  ics-import.test.ts`, `lib/calendar/work-schedule.test.ts`.
- **Flags:** none.

### 1.7 Childcare Requests
- **What:** Token-based, no-login-required care request/accept/decline flow between a household
  member and a provider person (who may not have a LifeOS account).
- **Tables:** `childcare_requests` (token `uuid unique default gen_random_uuid()`,
  `drive_minutes_to_provider` via `lib/external/travel.ts`).
- **Functions:** `get_childcare_request_preview` / `respond_to_childcare_request` (both `SECURITY
  DEFINER`, public/token-only auth by design).
- **Confirmed:** fully independent of intake/calendar-sync/conflict-detection; shares no code or
  tables with any Module 1–4 gap area. No changes needed or planned.
- **Tests:** present per D-060; not re-enumerated this pass.
- **Flags:** none.

### 1.8 Daily Brief
- **What:** AI-generated (with non-AI templated fallback) daily household brief, emailed and shown
  in-app.
- **Tables:** `briefs` (`content_json jsonb`, `content_markdown text`, `delivered_channels text[]`,
  `for_person_id`, `brief_date`).
- **Functions:** `lib/brief/generate.ts` → `generateDailyBrief()` — pulls from
  `listEventsInRange`, `listCustodyBlocksForHouseholdInRange`, `listActiveCadencesForHousehold`,
  `listSuggestionsDueForOrder`, `birthdaysToSurfaceInBrief`, `getNwsForecast`,
  `getWeekendPlanForDate`, `computeTravelLegs`/`computePrepObligations`, assembles one
  `BriefContextInput`, calls either `buildBriefUserPrompt` (AI) or `buildTemplatedBriefContent`
  (fallback). `lib/brief/schema.ts` defines the **fixed** `BriefContent` shape: `headline`,
  `today[]`, `headsUp[]`, `people[]`, `suggestion` (nullable, singular), `weather` (nullable,
  singular) — five bespoke arrays/objects, no generic item type.
- **Gaps found (feeds Module 8):** No registration interface — adding a new source requires
  editing `BriefContextInput`, both `buildTemplatedBriefContent` and the AI prompt/schema, and
  `app/(app)/page.tsx`'s hardcoded card list. No `priority`/`category`/`leadTime` field on any item
  type, hence no per-category cap or drop-lowest-priority mechanism anywhere. The one partial
  precedent, "Opportunities" (D-061), deliberately bypasses `content_json`/`BriefContent` entirely
  (separate table, separate cron, separate hardcoded card in `page.tsx`) rather than extending the
  schema — solves the problem by opting out of it, not a reusable contribution abstraction.
  **Module 8 requires a genuine refactor, not a light integration.**
- **Tests:** `lib/brief/render.test.ts`, `prep.test.ts`, `staleness.test.ts`,
  `template-fallback.test.ts`.
- **Flags:** none.

### 1.9 Notifications
- **What:** Pluggable channel-adapter dispatch (`in_app`, `email`, `push` stub, `sms` stub),
  household-editable channel preference, daily-brief email delivery already fully wired.
- **Tables:** `notifications` (in-app center; service-role-insert only), `households.
  notification_channels notification_channel[]` (default `{email}`).
- **Functions:** `lib/notifications/dispatch.ts` → `dispatchNotification()` — clean
  `ChannelAdapter` interface (`{channel, send()}`), `CHANNELS_BY_NAME` registry, per-channel
  failure isolation. `channels/email.ts` uses Resend with a console-log stub fallback when
  `RESEND_API_KEY` is unset (matches the known verified-domain blocker documented in the project
  knowledge wiki). `channels/sms.ts` and `channels/push.ts` are same-shape no-op stubs (SMS
  deferred per resolved Q-003 — no A2P 10DLC registration started; not exposed in Settings).
- **Note for Module 8:** this dispatcher is the **good** pattern to imitate — the brief schema is
  the one that needs the registration-interface treatment, not notifications.
- **Tests:** `lib/notifications/dispatch.test.ts` (asserts single-channel-failure isolation and
  SMS deferred-no-op behavior).
- **Flags:** none.

### 1.10 Settings
- **What:** Household preferences (gift scan horizon, notification channels, calendar feeds,
  work-schedule visibility), member management.
- **Tables:** `households` (various preference columns above), `calendar_feeds`.
- **Flags:** none.

---

## 2. Capability Matrix Status

`HAVE` = fully implemented and in production use. `PARTIAL` = a real building block exists but the
brief's specific behavior is missing or materially incomplete. `MISSING` = confirmed absent by
direct grep/read, zero matches.

| # | Capability | Status | Justification / File Reference |
|---|---|---|---|
| 1 | Photo → event capture | MISSING | No image/photo intake path anywhere in Brain Dump, Quick Capture, or any route (`app/api/brain-dump/*`, `app/api/capture`) — confirmed by grep for `image|photo|FormData|multipart`, zero matches. |
| 2 | PDF import | MISSING | Zero PDF-parsing code anywhere in the repo. |
| 3 | ICS import (calendar feed) | HAVE | `lib/calendar/ics-import.ts` + `lib/calendar/feed-sync.ts`, wired to Settings actions and `app/api/cron/calendar-sync`. One-way external → LifeOS only. |
| 4 | Forwarded-email intake | MISSING | Resend is outbound-only; zero repo hits for `"inbound"`; no inbound-email or generic webhook route under `app/api/`. |
| 5 | Voice capture | HAVE | Web Speech API client-side STT feeding the same text-based Brain Dump / Quick Capture routes — `app/(app)/brain-dump/brain-dump-client.tsx`, `components/capture/capture-button.tsx` (D-048). |
| 6 | Two-way sync — Google | MISSING | No Google Calendar API/OAuth client code anywhere; sync is generic `.ics`-URL pull, not provider-specific. |
| 7 | Two-way sync — Apple | MISSING | Same as above; only outbound artifact is a static custody `.ics` export (`lib/custody/ics.ts`), not a live sync. |
| 8 | Two-way sync — Outlook | MISSING | Same as above; no Microsoft Graph/CalDAV client code found. |
| 9 | Conflict detection (literal overlap) | HAVE | `lib/custody/conflicts.ts` → `detectCustodyWorkConflicts()`, tested in `conflicts.test.ts`. |
| 10 | Conflict detection (travel-time-aware) | MISSING | `conflicts.ts` never imports/calls `lib/external/travel.ts`, despite that module existing, being tested, and being used in 3+ other places (briefs, childcare drive-time, trip planner). |
| 11 | Daily brief (core) | HAVE | `lib/brief/generate.ts`, `lib/brief/schema.ts`, cron at `app/api/cron/brief`, rendered at `app/(app)/page.tsx`. |
| 12 | Off-app brief delivery (email) | HAVE | `generateDailyBrief()` calls `dispatchNotification` with `notification_channels`; migration `20260830000005` makes it a real household-editable preference, default `{email}` on. |
| 13 | Off-app brief delivery (SMS) | MISSING (deliberate stub) | `lib/notifications/channels/sms.ts` always returns `delivered: false`; matches resolved Q-003 (A2P 10DLC not started). Interface is ready; implementation deferred. |
| 14 | Preference memory (quiet hours / cadence / framing) | MISSING | Repo-wide search for `"preference"` returns only 2 incidental comments about the brief's own opt-in item list; no `quiet_hours`/`cadence`/`notification_preferences` table or column exists. |
| 15 | Meal planning | MISSING | Zero matches for `meal` anywhere in `app/`, `lib/`, `supabase/migrations/`. Confirmed greenfield. |
| 16 | Grocery list | MISSING | Zero matches for `grocery`. Confirmed greenfield. |
| 17 | Chores | MISSING | Zero real matches for `chore` (only unrelated substring false-positives). Confirmed greenfield. |
| 18 | Person memory graph (family/relation links, "how we met") | MISSING | `people`/`person_interests` have no relation-graph fields; only a single free-text `people.notes` catch-all. |
| 19 | Gift ideas | HAVE | `gift_suggestions` table + `lib/gifts/suggest.ts`, `lib/gifts/scan.ts`. |
| 20 | Gift pipeline (multi-stage) | PARTIAL | `gifts.status` enum has 5 states but only `given` is ever written (vestigial, per code comment `lib/gifts/convert.ts:6-11`); the real working lifecycle (`gift_suggestions.status`: `suggested→saved→ordered→dismissed/converted_to_gift`) has only 4 states, not the brief's 7-state `idea→shortlisted→decided→ordered→shipped→arrived→given`. |
| 21 | Gift reciprocity | MISSING | Only an unused `gifts.given_by_person_id` column; no received/promise/IOU tracking of any kind. |
| 22 | Moments (retrospective life-event capture) | MISSING | `trip_ideas` is the closest analog but is prospective bucket-list only (free-text `target_timeframe`, no place field), lives under Activities not People. |
| 23 | Leisure planning (activities, scoring) | PARTIAL | Activities, live external condition providers, and a 5-component weighted score all exist and work — but `conditionDataScore` is hardcoded `null` (D-020) so live fishing/tide/solunar data has zero numeric scoring effect, and the score `breakdown` is never persisted or shown to the user. |
| 24 | Viability inputs (activity-type-declared) | MISSING | `user_activities.activity_type` is free text; fishing-relevance is inferred ad hoc from location `external_ids`, not declared by activity type. |
| 25 | Gear checklists | MISSING | Confirmed absent — only one unactioned code comment referencing "gear packed Friday night." |
| 26 | Post-activity capture | PARTIAL | Only a single `last_done_at` timestamp (feeds recency-penalty scoring); no conditions/companions/rating/notes object captured. |
| 27 | Acts-on-behalf / execution autonomy | MISSING | Zero matches for `autonomy` anywhere; no tiered-autonomy or inbound-assistant-email concept exists. |
| 28 | Confidence scoring (intake) | MISSING | No numeric/graded confidence field anywhere in `lib/ai/capture-actions.ts`, `lib/ai/parse-json.ts`, or any intake route; only uncertainty signal is a boolean `eventDateApproximate` flag on Brain Dump calendar-event dates. |
| 29 | Review queue | PARTIAL | Brain Dump has a genuine all-or-nothing per-item review gate (nothing persists until "Save"); Quick Capture commits directly with only a missing-field clarification gate, not a confidence-graded queue. |
| 30 | Action audit log + undo | MISSING (undo is UI-only) | Zero matches for `"audit"`/`"action_log"` as real mechanisms. "Undo" exists only as client-side snapshot-and-recreate (`use-confirm-delete.ts`, `CalendarEventUndoSnapshot`), scoped to manual deletes in Calendar/Gifts — not a persisted log of any decision, autonomous or otherwise. |
| 31 | Multi-tenant (household isolation) | HAVE | RLS-enforced household scoping on every table, `requireHouseholdContext()` gate on every route/action (see project knowledge concept `person-record-and-rls`). |
| 32 | Permissions (owner/adult roles) | HAVE | Consistent owner/adult-only write gates across calendar, custody, gifts, settings actions (spot-checked in every file read this pass). |
| 33 | Ambient display mode | MISSING | Zero matches for `ambient`/`kiosk`/`wall`/`display` as a feature (only CSS/UI incidental hits). Confirmed greenfield. |
| 34 | Offline support | Not assessed this pass | Outside the 4 inventory subagents' scope; not directly relevant to Modules 1–8 as briefed. |
| 35 | iOS / Android / Web | HAVE | Capacitor-wrapped hosted app (`@capacitor/*` deps), confirmed shipped per prior segment's App Store prep work (see `APP-STORE-PLAN.md`). |
| 36 | Verified completion (DB re-check vs. AI claim) | MISSING (confirmed integrity gap) | Quick Capture's `confirmationMessage` is the AI model's own pre-write summary echoed back (`app/api/capture/route.ts` ~line 205), not a fresh read of the persisted row. Brain Dump avoids the problem by not generating descriptive confirmation text at all. |

---

## 3. Stack Notes

- **Language / framework:** Next.js 16.3.1, React 19.2.8, TypeScript `^5` strict mode
  (`tsconfig.json`), `moduleResolution: bundler`.
- **Package manager:** pnpm 11.22.0 (workspace).
- **Database:** Supabase-hosted Postgres 15 (`supabase/config.toml`).
- **ORM / query layer:** hand-rolled repository-factory pattern —
  `lib/db/repository.ts`'s `createRepository<Row, InsertT, UpdateT>(table)`, layered with
  table-specific finder methods under `lib/db/repositories/`. Not backed by Supabase codegen;
  `database.types.ts` is hand-authored, Row types are hand-written and Zod-tested per repository.
  **New services must follow this same pattern.**
- **Auth:** Supabase Auth via `@supabase/ssr`; centralized gate `requireHouseholdContext()` in
  `lib/auth/session.ts`, called from every `(app)` page/layout and nested Server Action — not
  per-route middleware.
- **Job runner:** none — no queue library of any kind. Vercel Cron hits plain Next.js API `GET`
  routes directly (`vercel.json`'s 5 cron entries), each gated by a `CRON_SECRET` bearer check,
  doing synchronous work in the request/response cycle. `scripts/run-*.ts` are `tsx` CLI
  equivalents for local/manual triggering. Vercel Hobby tier only allows daily cron (not hourly).
- **Test runner:** Vitest (`vitest run`); `pnpm test:rls` runs a separate pglite-based in-memory
  Postgres suite (`supabase/tests/pglite/**`) for RLS policy verification — used in place of
  Docker-based `supabase test db` since Docker isn't available in this sandbox.
- **Migrations:** Supabase CLI, timestamp-named `.sql` files under `supabase/migrations/`.
- **Secrets:** `.env.example`, categorized, explicit design principle in its own header comment:
  "every external integration is behind an interface with a working stub. `pnpm dev` must run with
  ZERO of these set." (Supabase, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`/`RESEND_FROM_EMAIL`,
  `GOOGLE_MAPS_API_KEY`/`MAPBOX_ACCESS_TOKEN`, `CRON_SECRET`.)
- **Deploy:** Vercel (`vercel.json`, `.vercel/project.json`), live at
  `lifeos-seven-rho.vercel.app`.
- **Feature flags:** **none exist yet.** The Additive Contract (brief §3.2) requires every new
  module to ship behind a flag defaulting off. This inventory found no existing flag mechanism to
  reuse — a new, additive `feature_flags` table/helper is the first piece of infrastructure built
  in this engagement (see DECISIONS.md D-115).

---

## 4. Sources

- `/home/user/workspace/inventory-module1.md` — Relationship & Gift domain (331 lines).
- `/home/user/workspace/inventory-module2.md` — Leisure Planner domain (257 lines).
- `/home/user/workspace/inventory-module3.md` — Universal Intake, Calendar Sync, Conflict
  Detection, Custody Scheduling (264 lines).
- `/home/user/workspace/inventory-module4.md` — Daily Brief, Notifications, Stack (468 lines).
- Direct reads of `DECISIONS.md` (D-001–D-114), `QUESTIONS.md` (Q-001–Q-006), `PROGRESS.md`,
  `KNOWN-ISSUES.md`, `APP-STORE-PLAN.md`, `package.json`, `vercel.json`, `.env.example`,
  `supabase/config.toml`, `tsconfig.json`.
