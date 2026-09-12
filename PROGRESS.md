# PROGRESS.md

Status per audit item. Updated at the end of each Phase. DONE / PARTIAL / BLOCKED / SKIPPED.

## Phase 0 — Orient and set up
- Setup: DONE — branch `fix/audit-pass` created, QUESTIONS.md/PROGRESS.md/AUDIT-MAP.md in place.

## Phase 1 — Blocking defects
- B-01: DONE — Month tab's href was missing `&range=month`, silently falling back to the "week" default (parseRangeParam) instead of crashing in local dev, but confirmed as a real link bug either way. Fixed to build `&range=` from every option explicitly, matching Day/Week/Agenda. Files: `app/(app)/calendar/page.tsx`.
- B-02: DONE (see Q1 for root-cause confidence caveat) — hardened the two request-wide single points of failure: `proxy.ts`'s per-request Supabase auth-refresh call (no try/catch before), and `app/(app)/layout.tsx`'s unread-notifications fetch (a layout-level throw skips `app/(app)/error.tsx` entirely). Added a new root `app/error.tsx` styled backstop for the (app)-layout case, and a shared `useAutoRetryOnce` hook (silent retry-once-with-backoff before showing any error UI) wired into both `app/(app)/error.tsx` and the new `app/error.tsx`. Files: `proxy.ts`, `app/(app)/layout.tsx`, `app/error.tsx` (new), `app/(app)/error.tsx`, `app/global-error.tsx` (comment only), `lib/hooks/use-auto-retry-once.ts` (new).

## Phase 2 — Major defects
- M-01: PARTIAL — person detail page fixed (3 sites). Systematic codebase audit found 16 further real instances (see QUESTIONS.md Q3); fixed 13 of them this pass: custody schedule materialization (`lib/custody/materialize.ts` + its 4 API-route callers — this is very likely the actual root cause of D-04's "4 overlapping custody blocks"), the custody .ics export/detail/hub pages, `/api/calendar/conflicts`, the ambient wall display, Settings' upcoming-time-off filter, and — needing new plumbing rather than a one-line swap — the weekend-planner cron (`lib/planner/generate.ts`, moved its existing owner-user lookup earlier so the household's stored timezone is always available as a fallback when no caller passes one), the opportunities-detection cron (`lib/opportunities/detect.ts`, same pattern), and the brief's gift order-by-date reminders (`lib/db/repositories/gifts.ts`'s `listSuggestionsDueForOrder`, now takes the brief's already-zoned `today` instead of silently recomputing its own UTC one — directly relevant to M-08). Remaining: the AI daily-spend budget reset boundary, Quick Capture/Brain Dump's AI date context and default dates, and Universal Intake's default occasion/moment dates — all need a `timezone` parameter threaded through 1-2 more layers of an existing call chain that already resolves it at the top (page/route level).
- M-02: DONE — work shifts now carry real start/end times (`withTimeOfDay` in `lib/calendar/work-schedule.ts`) instead of being forced into the all-day strip at midnight; raw `HH:MM:SS` DB values on person/Settings pages now go through the existing `formatTime` helper (now exported). Files: `lib/calendar/work-schedule.ts`, `app/(app)/calendar/page.tsx`, `app/(app)/settings/my-schedule.tsx`, `app/(app)/people/[id]/page.tsx`.
- M-03: DONE — the actual bug was a display-NAME inconsistency (nickname vs. full legal name shown depending on screen), not a query/exclusion bug: `listPeopleForHousehold` is already the single canonical roster query used everywhere (confirmed by reading it — it's already documented as such). New shared `lib/people/display-name.ts` (`personDisplayName`), migrated ~20 call sites that were still using a raw `person.full_name` in a picker/list/label context (calendar event attendee picker, household chores/dietary pickers, custody forms, activities companion pickers, packing traveler picker, relationship-gift-engine forms, the person detail page's own H1). See QUESTIONS.md Q2 for the "Fritz is missing" / owner-in-pickers findings.
- M-04: PENDING
- M-05: PENDING
- M-06: PENDING
- M-07: PENDING (fixed properly under A2)
- M-08: PENDING

## Phase 3 — Moderate defects
- D-01: PENDING
- D-02: PENDING
- D-03: PENDING
- D-04: PENDING
- D-05: PENDING
- D-06: PENDING
- D-07: PENDING

## Phase 4 — Polish defects
- P-01: PENDING
- P-02: PENDING
- P-03: PENDING
- P-04: PENDING
- P-05: PENDING
- P-06: PENDING
- P-07: PENDING
- P-08: PENDING

## Phase 5 — Navigation and IA
- A1: PENDING
- A2: PENDING
- A3: PENDING
- A4: PENDING

## Phase 6 — Today page
- B1: PENDING
- B2: PENDING
- B3: PENDING
- B4: PENDING
- B5: PENDING
- B6: PENDING
- B7: PENDING

## Phase 7 — Person pages
- C1: PENDING
- C2: PENDING
- C3: PENDING

## Phase 8 — Gifts
- D1: PENDING
- D2: PENDING
- D3: PENDING
- D4: PENDING
- D5: PENDING

## Phase 9 — Calendar
- E1: PENDING
- E2: PENDING
- E3: PENDING
- E4: PENDING
- E5: PENDING

## Phase 10 — Density, touch targets, tables
- F1: PENDING
- F2: PENDING
- F3: PENDING
- F4: PENDING

## Phase 11 — Appearance / design system
- G1: PENDING
- G2: PENDING
- G3: PENDING
- G4: PENDING
- G5: PENDING

## Phase 12 — Copy
- H1: PENDING
- H2: PENDING
- H3: PENDING (= D-01)

## Phase 13 — Feedback, trust, session
- I1: PENDING
- I2: PENDING
- I3: PENDING
- I4: PENDING

## Phase 14 — Accessibility
- J1: PENDING (= C3)
- J2: PENDING

## Phase 15 — Verification
- PENDING

## Phase 16 — Final report
- PENDING
