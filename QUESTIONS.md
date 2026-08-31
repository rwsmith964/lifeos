# QUESTIONS.md

Questions that genuinely cannot be decided without Richard's input, per Section 1.4. Sorted by priority (HIGH, then MEDIUM, then LOW) within each pass. Deduplicated.

---

## HIGH

(none open)

## MEDIUM

## Q-004 | shell layout / desktop-tablet | Priority: MEDIUM | Opened 2026-08-30
**Question:** The whole app shell is intentionally a narrow ~448px mobile-width column, centered with large unused margins on tablet/desktop (confirmed by the D-049 audit — zero functional bugs, just an unused-space product question). Should LifeOS ever get a real multi-column desktop layout, or is "phone-shaped app centered on desktop" fine indefinitely? It's a legitimate, common pattern for personal apps used mostly on a phone, so there's no wrong answer here — just needs your call before investing in a desktop-specific layout.

## LOW

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
