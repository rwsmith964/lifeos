# KNOWN-ISSUES.md

Running log distinguishing "not done yet" from "won't do." Updated as work continues. Superseded entries from round 1 are removed once verified closed — git history has the record if needed.

---

## Fixed and verified live this pass (round 2, D-032)

Duplicate-interest crash (now an upsert, no error at all); duplicate gift-budget crash (same fix, same latent bug, not separately reported); `app/(app)/error.tsx` + `app/global-error.tsx` boundaries; every leaked raw string listed in the brief's 1.3 table plus the capture route's `error.message` interpolation; cadence status now reads real last-contact instead of a column nothing ever wrote to; future birthdates rejected server-side, `estimateAgeYears` floors at null; "Get gift ideas" first-click-does-nothing (missing date default); AI buttons now disabled-with-tooltip via `/api/health` instead of submitting into a guaranteed failure; back link from person detail to `/people`; activity-title casing (was a `capitalize` CSS class on the activities list, not data corruption — removed; seed data ("golf", "fishing", etc.) now renders lowercase as actually stored, which is a minor cosmetic step down for the demo data but is the correct fix for real user input).

## Open — from the round 2 brief, not yet started

- **1.2, partial**: the three AI features are correctly *wired* now (health-gated, friendly errors, spinners) but still non-functional because `ANTHROPIC_API_KEY` isn't set in Vercel. Waiting on the key.
- **1.2**: deploy-time build check exists (`scripts/check-ai-config.mjs`) but defaults to a warning, not a hard failure — see the "Deferred / won't-do-as-specified" section below for why, and the flag to flip once the key is confirmed set.
- **1.3**: field-level error placement + clear-on-edit was applied to the two forms the brief's table named (gift budgets, calendar event start/end). Not applied to every other form with a validation error (interests, cadence, activities, settings) — those still show one message near the submit control. Settings' stale-"Saved."-message complaint appears to have been a symptom of D-031's original bug (state never updated on a failed retry); not independently re-reproduced this pass.
- **1.5**: no confirm/undo on any delete (activities, gift history, calendar events, custody blocks) — not started.
- **All of Phase 2** (custody schedule view, recurrence, multi-day rendering, per-day bands, ICS export) — proposal requested before building; see the response accompanying this file. Not started.
- **All of Phase 3, 4, 5** — not started. Notably still open: People list double-name display and sort-by-hidden-field; raw `kid_activity`-style enum chips; empty calendar days not clickable / auto-scroll / post-create redirect; Settings timezone free-text and no IANA select; Gifts tab empty-state copy and horizon exposure; brief Markdown rendering, tappability, "seeing them today" suppression, look-ahead; weather provider + location field; Activities form's five USGS/ODFW/NOAA/lat/lng fields; PWA manifest/dark-mode/responsive shell/404/forgot-password; household membership (Phase 4.1) and everything in Phase 4/5.

## Found during this pass, not in the brief

- **Multiple custody-block rows found for the same Emma/Sep 5–7 span** while cleaning up test data (three rows, not the one the brief described creating). Could be a genuine double-submit bug in the pre-D-031 custody form, or just repeated manual test attempts during round 2's QA pass — not investigated further, since Phase 2 replaces this form outright. Worth keeping an eye on double-submission generally once the new schedule view exists.
- **`app/onboarding/onboarding-form.tsx`** still uses native `<form action={dispatch}>` binding, unaudited against D-031/D-032 — it sits outside `(app)`'s auth-redirecting layout so it's probably unaffected, but this has not been verified live with a fresh signup this pass or last.
- **Gift and notification actions** (`app/(app)/gifts/actions.ts`, `app/(app)/notifications/actions.ts`) weren't individually re-verified live this pass; they use the confirmed-working `startTransition()` direct-call pattern, not the `<form action>` binding, so risk is low but unconfirmed.

## Deferred / won't-do-as-specified (with reason)

- **"Fail the build if `ANTHROPIC_API_KEY` is absent"** — implemented as `scripts/check-ai-config.mjs`, but defaults to warn-only (`REQUIRE_ANTHROPIC_KEY=1` opts into the hard failure the brief asked for). Turning on a hard failure the same pass the key still isn't configured would have failed every subsequent deploy, including the one shipping this remediation, until someone noticed. Flip the env var once the key is confirmed set in Vercel to get the originally-specified behavior.
