# KNOWN-ISSUES.md

Running log of issues found during the remediation pass that aren't already itemized in the QA brief, plus brief items not yet closed out. Updated as work continues.

---

## Open — from the QA brief, not yet started

- **1.3** AI features (gift ideas, weekend plan, Quick Capture) still report "unavailable" — needs `ANTHROPIC_API_KEY` in Vercel env (Richard is sending it), plus the `/api/health` gating, loading states, and user-facing copy changes described in the brief.
- **1.4** "Never lose user input" — done for the four converted create forms (person/event/custody/activity) and now effectively true for every form fixed under D-031, since none of them navigate away on failure anymore (client-side dispatch, not a page reload). Not yet audited form-by-form for field-level error placement (brief asks for errors next to their field, not one anonymous string).
- **1.5** No confirm/undo on deletes (activities "Remove", gift history "Remove", calendar event "×") — not started.
- **Phase 2** (brief regeneration cadence, notification rendering/deep-links, gifts pipeline, settings validation, data-integrity checks) — not started.
- **Phase 3-5** — not started.

## Found during this pass, not in the original brief

- **`app/onboarding/onboarding-form.tsx`** still uses native `<form action={dispatch}>` binding. It's outside the `(app)` route group (no parent auth-redirecting layout), so it's likely unaffected by D-031's bug — not yet verified live with a fresh signup.
- **Notification actions, gift actions (`app/(app)/gifts/actions.ts`, `app/(app)/notifications/actions.ts`), and remaining calendar/activity delete or generate actions** were not audited for the D-031 form-action-binding bug specifically — they use direct `startTransition()` calls (the pattern confirmed working via `LogInteractionButton`), which is a good sign, but none were re-verified live in this pass.
- **Custody responsible-parent picker** still offers every adult in the household (including grandparents Carol/Tom, per brief 3.3) — end-before-start is now rejected server-side ([app/api/calendar/custody/route.ts](app/api/calendar/custody/route.ts)), but the picker scope itself is unchanged.
- **Zod validator audit**: `z.uuid()` → `z.guid()` was fixed at the shared-helper level in `lib/db/schemas.ts`, so it covers every schema, but no broader sweep was done for other `zod` strictness mismatches against what Postgres actually enforces.

## Fixed and verified live in production this pass (D-031)

Person/event/custody-block/activity creation, "Log contact today," Settings save, Edit person, Add interest, Set cadence, Sign out — each clicked through on the live site and (where it writes data) confirmed via a direct database read, not just UI appearance.
