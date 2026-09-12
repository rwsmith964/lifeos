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
- M-04: DONE — "Regenerate weekend plan" only ever touched the old single-recommendation `weekend_plans` system, while Plan's actual scored day-proposals (and Today's/Notifications' quoted scores) come from the separate opportunity-detection engine, which the button never re-ran — so it could never visibly change anything the user was looking at. Now also re-runs `detectOpportunitiesForHousehold`, and the action always returns a message ("Found N new ideas" / "Checked again — nothing new stood out") shown even on success. Files: `app/(app)/calendar/actions.ts`, `app/(app)/calendar/generate-weekend-plan-button.tsx`.
- M-05: DONE — spend bar now counts only `status === "ordered"` toward "spent" (was counting "saved" too, so shortlisting flipped a $0-spent budget to $80 before anything was bought); saved-but-not-ordered cost now shown separately as "$X earmarked," differently styled. Files: `app/(app)/gifts/gift-suggestion-groups.tsx`.
- M-06: DONE — the person drawer's "GIFT SHORTLIST" was rendering every active suggestion (mostly status "suggested"), not what's actually saved. Narrowed to status saved/ordered, matching `/gifts/saved`'s own filter. Files: `app/(app)/people/page.tsx`.
- M-07: PENDING (fixed properly under A2)
- M-08: DONE (code fix; see PROGRESS Phase 3 for the existing-data cleanup script) — `scanHouseholdForGiftOccasions` had no upper bound on "past due," so a suggestion tied to an occasion that already happened kept generating fresh "Order by <date-in-the-past>" notifications every day the cron ran, forever. Now transitions any suggested/saved suggestion whose occasion has passed to "dismissed" (reusing the existing status, no schema change) before the notification pass, and excludes those from notification generation. Files: `lib/gifts/scan.ts`, `app/api/cron/gift-scan/route.ts`, `scripts/run-gift-scan-job.ts`.

## Phase 3 — Moderate defects
- D-01: DONE (fallback chosen, not the full read path — see QUESTIONS.md Q6) — dropped "Ask" from the capture placeholder/labels ("Add or dump a thought…") since Quick Capture is write-only and can't answer questions; added a question-shaped-input heuristic to `/api/capture`'s empty-items branch so a real question gets an honest "I can't answer questions yet" message instead of the generic "nothing to save" refusal. Files: `components/capture/capture-panel.tsx`, `components/capture/command-bar.tsx`, `components/capture/mobile-capture-button.tsx`, `app/api/capture/route.ts`.
- D-02: DONE — Today's heads-up items weren't categorized/tagged distinctly; added `categorizeHeadsUpItem` (`today-priority-items.ts`) so each item carries a tag `TAG_META` can render consistently instead of a flat undifferentiated list.
- D-03: DONE — daily-brief "Rebuild" minted a fresh notification every click, so the feed accumulated near-duplicate entries per day; `generateDailyBrief` gained a `notify` parameter (manual rebuild passes `false`), and a one-off cleanup script deduped the existing backlog. Files: `lib/brief/generate.ts`, `app/(app)/actions.ts` (`regenerateBriefAction`), `scripts/dedupe-brief-notifications.ts` (new, run against production — 17 of 63 duplicates removed).
- D-04: DONE (data-level root cause; render-time stacking deferred — see QUESTIONS.md Q7) — `materializeCustodySchedule`'s `windowStart` was recomputed via a bare `new Date()` on every call, so two mutations straddling a UTC-midnight rollover could disagree on which day's blocks to delete-then-recreate, leaving stale overlapping blocks behind. Fixed to take a caller-supplied, consistently-computed `now` (see M-01/Q3); ran `scripts/rematerialize-custody-schedules.ts` (new) against the real household — confirmed via direct query that overlaps existed Aug 31-Sep 2 and none remain from Sep 10 onward. Files: `lib/custody/materialize.ts` + its 4 API-route callers, `scripts/rematerialize-custody-schedules.ts` (new).
- D-05: DONE (destructive — not reversible, see QUESTIONS.md Q5) — the "someone" placeholder-name notifications were frozen daily-brief snapshots from now-deleted test data, not a live/reproducible bug; the one plausible current mechanism (an archived person's cadence) was confirmed already correctly filtered. Ran `scripts/cleanup-test-data.ts` (new) against production: deleted 6 "ZZ " test people and 14 stale test-referencing notifications; 0 matching test calendar events found.
- D-06: DONE — the People page's childcare section showed every request ever made, including cancelled/expired/weeks-past, with no way to see what's actually upcoming. Now defaults to pending/accepted requests dated today or later, with an explicit "Show past & cancelled (N)" toggle to see the rest. Files: `app/(app)/people/childcare-section.tsx`, `app/(app)/people/page.tsx` (passes `today`).
- D-07: DONE — the relationship/gift-engine forms' "Saved." confirmation state could appear on first mount (an effect reacting to "no error" fired before any real submission), since a shared `{ error: string | null }`-shaped `useActionState` initial state is indistinguishable from a real success. Added a `hasSubmitted` ref, gating the effect so "Saved." only shows after an actual save. Files: `app/(app)/people/[id]/relationship-gift-engine-forms.tsx`.

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
- A1: DONE — sidebar labels now show at every width the sidebar itself renders (previously xl+ only; the 768-1279px tier was icon-only with a hover-title tooltip, exactly the audit's "unlabeled rail"). New `SidebarNav` client component, icon-above-label in the compact rail (matching the mobile tab bar's own convention) / icon-beside-label at xl+, plus real `aria-current="page"` and an active background/text state. Live-verify caught a real dev-console warning from the initial pre-rendered-icon-as-prop approach (also latent in the pre-existing `MobileCaptureButton`); fixed by sending a plain string icon name across the server/client boundary instead (`components/nav/nav-icon.tsx`, new) — see QUESTIONS.md Q8. Files: `app/(app)/sidebar-nav.tsx` (new), `app/(app)/layout.tsx`, `components/nav/nav-icon.tsx` (new), `components/capture/mobile-capture-button.tsx`.
- A2: DONE — grew the sidebar to the audit's exact 8-item list (Today, Calendar, People, Plan, Household, Gifts, Brain dump, Notifications); Settings kept out of the list, pinned at the bottom with a now-visible "Settings" label at every width (previously an avatar-initials-only chip at the compact tier). Mobile bottom bar unchanged (4 slots); Notifications stays reachable via the header bell on mobile, Household/Brain dump via existing cross-links — see QUESTIONS.md Q8. Files: `app/(app)/layout.tsx`, `components/ui/avatar-menu.tsx`.
- A3: DONE — rewrote every module's Settings description out of "Module N: ..." jargon into plain language; added a Settings-row "Open →" deep link for every flag with a real page (`/intake`, `/ambient`, `/execution`, `/household`, `/packing`) so a household member never has to guess a URL (the audit's own "/wall" 404 was exactly this gap); hid the 2 flags with genuinely no UI anywhere (`scheduling_v2`, `brief_registration_v2`) from the Settings list rather than leaving a toggle with no observable effect — see QUESTIONS.md Q9. Files: `lib/flags.ts`, `app/(app)/settings/feature-flags.tsx`.
- A4: DONE — new shared `Breadcrumb` component wired into every nested page found (person detail/edit, add person, request childcare, calendar add/edit event, the whole custody family, activities/trip-idea add/edit, packing add/detail, gifts/saved, settings/activity, execution, intake), replacing the one bespoke breadcrumb and scattered "← X" links that existed before. See QUESTIONS.md Q10 for scope notes. Files: `components/nav/breadcrumb.tsx` (new), ~20 page files.

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
