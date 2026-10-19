# AUDIT-MAP.md

File-ownership map for the 2026-09-11 audit pass, built from direct knowledge of this codebase
(this session built the current redesign that the audit is reviewing) plus targeted verification.
Updated as each phase proceeds; a "?" means not yet confirmed by reading the file.

## Repo shape

- Next.js 16.3 App Router, RSC + Server Actions, Supabase (Postgres + Auth), deployed on Vercel.
- Route group `app/(app)/` holds every authenticated screen behind `app/(app)/layout.tsx` (sidebar,
  header, command bar, mobile tab bar). Auth/onboarding routes (`login`, `signup`, `onboarding`,
  etc.) sit at `app/` top level, outside the group.
- Design tokens: `app/globals.css` (role tokens per palette/mode, `@theme` blocks, legacy shadcn
  bridge). Primitives: `components/ui/*` (button, badge, card, input, label, priority-card,
  rail-card, avatar, table-row, segmented-control, empty-state, skeleton, sheet, dialog, toast).
- Data layer: `lib/db/repositories/*.ts` (one file per table family), `lib/db/database.types.ts`
  (hand-maintained row types), Supabase clients in `lib/db/client-server.ts` (RLS-scoped,
  cookie-based) and `client-service-role.ts` (cron/admin only).
- Timezone helper: `lib/timezones.ts`'s `getZonedNow(timezone)` — the household's stored IANA
  timezone, not a bare `new Date()`. Already used in `page.tsx` (Today), `gifts/page.tsx`,
  `calendar/page.tsx`; **M-01 is about finding where it's *not* used**.
- Tailwind v4, CSS-first config (no `tailwind.config.*`), tokens via `@theme`/`@theme inline` in
  `app/globals.css`.
- Tests: `vitest` (unit, `lib/**/*.test.ts`), `supabase/tests/pglite` (RLS), `playwright`
  (e2e config present, no e2e specs found yet — noted, not built new).

## Phase 1 — Blocking
- B-01: `app/(app)/calendar/page.tsx` (Day/Week/Month/Agenda segmented control ~line 1059-1079;
  `parseRangeParam` ~line 501).
- B-02: `proxy.ts` (per-request Supabase auth refresh), `app/(app)/layout.tsx` (notifications
  fetch), `app/(app)/error.tsx`, `app/error.tsx` (new), `app/global-error.tsx`.

## Phase 2 — Major
- M-01: date/timezone helper unification. Canonical helper: `lib/timezones.ts`. Consumers to
  audit: `lib/people/rhythm.ts` (People list "N of M days"), `lib/brief/*` (Today briefing),
  `app/(app)/people/[id]/page.tsx` (detail page "Overdue" line).
- M-02: shift-event generation — likely `lib/brief/*` or a calendar day-item builder that turns
  `work_schedules` rows into `DayItem`s; time formatting on person/Settings pages —
  `app/(app)/settings/my-schedule.tsx`, person edit form.
- M-03: people query duplication — `lib/db/repositories/people.ts` (`listPeopleForHousehold`) vs.
  whatever powers `/calendar/new`, `/household` pickers, and person-page Relationships block.
  Display-name helper: none confirmed yet: `nickname || full_name` pattern is inlined ad hoc in
  several places (`people-table-client.tsx`, `page.tsx`) rather than one shared function.
- M-04: weekend-plan scoring — two paths: `lib/planner/generate.ts` (AI narrative, single
  recommendation) vs. `lib/opportunities/detect.ts`/`present.ts` (the real per-candidate `score`
  the redesign wired Plan's proposal cards to, Step 7). Regenerate button:
  `app/(app)/activities/generate-weekend-plan-button.tsx`.
- M-05: gift budget "spent" calc — `app/(app)/gifts/gift-suggestion-groups.tsx` (spend bar, this
  session's own Step 8 code).
- M-06: person drawer gift shortlist — `app/(app)/people/people-table-client.tsx`
  (`PersonDetailPaneContent`, `giftShortlist` prop) vs. `app/(app)/gifts/saved/page.tsx`.
- M-07: nav entries for Household/Brain dump — `app/(app)/layout.tsx` `NAV_ITEMS` (fixed under A2).
- M-08: past-occasion handling — `lib/gifts/occasions.ts` (`scanUpcomingOccasions`,
  `nextOccurrenceOfMonthDay`), `lib/gifts/suggest.ts`, notification generation for order-by
  reminders (`lib/notifications/*` ?).

## Phase 3 — Moderate
- D-01: `components/capture/command-bar.tsx`, `capture-panel.tsx`, brain-dump parse route.
- D-02: Today card categorization — `lib/brief/*` contributors, `app/(app)/page.tsx` `TAG_META`.
- D-03: briefing regeneration/notification dedup — `lib/brief/generate.ts`,
  `app/(app)/regenerate-brief-button.tsx`, `app/actions.ts` (`regenerateBriefAction`),
  `lib/db/repositories/system.ts` (notifications insert).
- D-04: custody data — `custody_blocks`/materialized schedule rows (Supabase), renderer in
  `app/(app)/calendar/page.tsx`'s custody band logic + `lib/calendar/week-custody-ribbon.ts`.
- D-05: test/placeholder data cleanup — a one-off script under `scripts/`, `people` table rows,
  `lib/brief/generate.ts` (guard against nameless person).
- D-06: childcare requests block — `app/(app)/people/page.tsx` or a sibling component (?
  confirm — not one I built this session, needs a read).
- D-07: person page "Saved." state — `app/(app)/people/[id]/*-forms.tsx` (multiple forms, same
  pattern likely repeated).

## Phase 4 — Polish
- P-01/P-02: `app/(app)/people/new/*` or `person-forms.tsx` add-person form.
- P-03: `app/(app)/activities/page.tsx` (day-section headings "SATURDAY"/"SUNDAY").
- P-04: `components/capture/capture-panel.tsx` (⌘K panel positioning/backdrop).
- P-05: `app/not-found.tsx`.
- P-06: month-grid cell layout — `app/(app)/calendar/page.tsx` month view render.
- P-07: `app/(app)/gifts/gift-suggestion-groups.tsx` ("Search on {retailer}" link).
- P-08: quick-capture classifier — `lib/ai/` or `lib/capture/` parse logic (? confirm).

## Phase 5 — Navigation / IA
- A1-A4: `app/(app)/layout.tsx` (sidebar/nav), `components/ui/avatar-menu.tsx`,
  `app/(app)/settings/feature-flags.tsx` (module descriptions), person-page back-link.

## Phase 6 — Today
- All of B1-B7: `app/(app)/page.tsx`, `components/ui/priority-card.tsx`, `components/ui/rail-card.tsx`,
  `lib/brief/today-priority-items.ts`, `app/(app)/regenerate-brief-button.tsx`.

## Phase 7 — Person pages
- C1-C3: `app/(app)/people/[id]/page.tsx` + its sibling `*-forms.tsx` files (not built this
  session — needs a full read).

## Phase 8 — Gifts
- D1-D5: `app/(app)/gifts/gift-suggestion-groups.tsx`, `gifts/page.tsx`, `gifts/saved/page.tsx`.

## Phase 9 — Calendar
- E1-E5: `app/(app)/calendar/page.tsx` (custody bands, work-shift chips, toolbar, weekend
  accordion, layer legend).

## Phase 10 — Density / tables
- F1: `components/ui/button.tsx`, `segmented-control.tsx`, control-height tokens in `globals.css`
  (`--spacing-control-compact` etc).
- F2-F3: `components/ui/table-row.tsx`, `app/(app)/people/people-table-client.tsx`.
- F4: `app/(app)/notifications/page.tsx` (? confirm — not built this session).

## Phase 11 — Design system
- G1-G5: `app/globals.css`, `components/ui/button.tsx`, `components/ui/card.tsx`.

## Phase 12 — Copy
- H1-H2: sweep across `app/(app)/**/*.tsx` for generic labels ("Open", button text).

## Phase 13 — Feedback / trust / session
- I1: `app/(app)/regenerate-brief-button.tsx`, `generate-weekend-plan-button.tsx`.
- I2: `app/login/*`, session/proxy handling, `app/(app)/error.tsx`.
- I3: `lib/hooks/use-async-toast-action.ts` (existing Undo pattern), gift/activity/person delete
  actions.
- I4: `app/(app)/settings/page.tsx` (mixed save models).

## Phase 14 — Accessibility
- J1: same as C3 (person page headings).
- J2: same as A1/A4 (sidebar aria-current).

Confirmed-by-reading annotations get added inline in each Phase's own commit as I go.
