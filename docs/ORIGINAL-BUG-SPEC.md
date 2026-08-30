# Original P0–P3 Bug Report Spec (recovered verbatim, 2026-08-30)

Recovered from session turn history after a context compaction dropped the
full text and left only short TODO labels. Preserving here so it's never
lost again mid-build.

## User's original message

LifeOS — bug fix + improvement request
I did a full walkthrough of my LifeOS app as a user and found a set of bugs and gaps. Please work through them in the order below. Ship P0 first, then P1, then P2, then P3. After each priority group, tell me what you changed and what you couldn't do.

Ground rules:
- Don't refactor beyond what each fix needs.
- Where two parts of the app disagree, make one the single source of truth rather than patching both.
- Every destructive or async action needs visible feedback (loading state, success confirmation, and undo where possible).
- Don't show raw enum values, ISO dates, or Markdown syntax to the user anywhere.

### P0 — Broken, fix first
1. Delete on a calendar event does nothing
2. The AI doesn't receive the nicknames the app itself displays
3. Notifications render raw Markdown as plain text
4. Brain dump's review step shows empty fields but saves values I never saw
5. There are three household rosters and they disagree

### P1 — Wrong or contradictory
6. Opportunities returns everything, so it means nothing
7. Drive time is 0 minutes for every location
8. Two scoring engines disagree about the same day
9. My son's birthday was 2 days ago and nothing noticed
10. Gift cards show an order-by date that's already in the past
11. Duplicate gift suggestions and an unstable list order
12. "Save" on a gift has no feedback and nowhere to go — Clicking Save produces no toast, no badge, no change to the card, and there's no saved-gifts list anywhere in the app. I have no idea whether it worked. Dismiss removes the card but with no undo and no way to review what I've dismissed. **Fix: add a Saved state on the card, a Saved / Shortlist view, and an undo on Dismiss.**
13. The daily brief is a stale cache presented as current — After I added an event to Sunday Aug 30, the brief still read "No events this weekend." It's stamped "about 9 hours ago" in the notifications list, but the Brief page shows it undated with only a manual "Refresh brief" button. **Fix: show the generation timestamp on the Brief page, and regenerate (or show a "data has changed since this was written" hint) when underlying events/people change.**
14. Quick capture rejects sentences Brain dump handles fine — Typing "Cal's shoe size is 10" into Quick capture returns "Couldn't understand that — try rephrasing." That's a person note, and "Person note" is one of the seven types Brain dump supports. The error gives no hint about what would work, and my typed text is discarded so I have to retype it. **Fix: have Quick capture call the same parser as Brain dump. On failure, keep the text in the box and say specifically what was unclear (e.g. "I got the note but not who it's about — who is this for?") rather than a generic rejection.**

### P2 — Rough edges
1. The floating sparkle button overlaps my own controls (calendar event ×, gift budget Remove, Activities Remove, Settings Home address field). Move it above the bottom nav and add matching bottom padding.
2. Raw enum values and ISO dates leak into the UI. Gift cards read "For Callan Smith · just_because 2026-08-28". Brain dump gets this right ("Just because") — make the rest match, and format dates the way the Brief does ("Saturday, August 29").
3. Add Event doesn't prefill the date I just clicked. Prefill from the selected day. Also add a Cancel / back control.
4. The Calendar buries itself under the weekend plan. ~400px of AI narrative sits above the month grid. Make it collapsible (collapsed by default), or move it to the Brief. Also the header has three overlapping controls (Custody button, Month/Week/Day switch, All/Custody switch) — remove the redundant one.
5. Native form controls break the dark theme. Checkboxes render as default light-grey OS boxes. Timezone dropdown is unstyled native select with ~400 entries, no search — make it a searchable combobox defaulting to browser's detected zone. Replace browser-native validation tooltips with styled inline errors.
6. Default gift budget shows two different numbers. Settings says $25–$150; person page shows default $0–$150. Make the person page read the household default.
7. No confirmation, no undo, no loading state on key actions. "Remove" on activity and "Dismiss" on gift delete immediately with no confirm/undo. "Get gift ideas" runs ~10s with no spinner, then a small "Done" appears with no auto-navigation. Match Brain dump's pattern ("Reading through that…") everywhere, and navigate to results.

### P3 — Features to add
1. "Last done" tracking on activities, feeding the planner. Add a last-completed date per activity (set when marking an opportunity "Acted on", or manually), weight recency into score.
2. One activity, many locations. Golf is modelled as two separate activities; Shooting is one activity with two locations. Make it consistently the latter.
3. Seasonality and daylight on activities. Add a season window and "needs daylight" flag per activity; check proposed window against sunrise/sunset.
4. A saved-gifts shortlist with lifecycle states: Saved → Ordered → Given, writing "Given" into Gift history.
5. Real notification delivery. Add delivery channel preferences (email/push) in Settings and actually send the daily brief.
6. Calendar import (Google Calendar / iCal) so the weekend planner knows real free/busy time.
7. Keep the original brain-dump transcript stored with the batch, allow re-running it.

### Test data to clean up (all now handled / no longer present as of D-069+)
- Calendar event "Test event from review" — Sun Aug 30, 9:00 AM
- Calendar event "Trampoline park with Cal" — Tue Sep 1, 7:00 AM
- A tee-time event on Sat Sep 5
- The "Invitee Three" person record
- Duplicate gift suggestions for Callan Smith from two back-to-back generation runs

### How the user will verify
- Create an event, delete it, hard-reload — it's gone.
- Type "Cal's shoe size is 10" into Quick capture — it resolves to Callan Smith without asking.
- Open the bell menu — no ## or ** anywhere.
- Paste a multi-item note into Brain dump — every parsed field is visible and editable before saving.
- Open People, Add Event, and Settings — all three show the same people.
- Open Opportunities — a handful of grouped, deduped, genuinely-standout windows with real drive times.
- Check the same activity's score on Opportunities, the Brief, and the weekend plan — same number.

## Custody-builder follow-up feedback (given later, now addressed by D-074/D-075)

"one of the issues that I'm seeing is that it's a little bit confusing when building out a custody schedule and also it would be nice to have a feature in the pool where you can upload custody agreements and have the AI reading pool and then filled out the calendar and then you verify that it is correct before continuing, but for example, for my custody situation. I have both of the kids at the same time and there's no option to be able to select both kids for the custody arrangement you can only select one at a time and build out their calendars which I think is fun that should still exist, but to be able to do both on top of that. My custody arrangement is to pick up the kids at 4:30 in the afternoon on a Friday and have them through 8:30 AM Monday morning and it's a little confusing to try to build that out and I think there's a better way if you can figure out a better way of articulating that like maybe each day has its own time frames with a all day button that you can pick clearly delineating who has what kids and what times on what days"
