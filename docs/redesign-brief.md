# LifeOS redesign — build prompt

## Context

You are working on LifeOS, a private household-assistant web app deployed at lifeos-seven-rho.vercel.app. It is a real product in progress, intended to ship as a paid consumer app. One household is live: Richard Smith, two kids (Cal, 4; Em), a co-parent (Mel) with a shared-custody calendar, a father (Fritz), and a childcare provider (Jackie). The app is multi-tenant and permission-aware underneath, with one active login today.

Today the app has six top-level sections — Brief, People, Gifts, Calendar, Activities, Settings — on a near-black shadcn/ui default theme, the Geist typeface, and `--radius: 0.625rem`.

Your job is a full UI/UX redesign: new information architecture, new visual system, three switchable colour palettes, and a real pass on layout, density, states and responsiveness. Do not change the data model, the API surface, or business logic except where a section explicitly moves. Every behaviour that works today must still work when you are done.

Before writing any code, read the repository — actually read it, file by file, do not infer from names — and confirm for yourself: the framework and router, the styling system, where design tokens live, where the nav is defined, which components each page composes, and how light/dark is currently switched. Build from what you find, not from what this prompt assumes. Where this prompt does not override a value, copy the exact existing one rather than rounding it.

## Part 0 — Visual reference

Three reference images live in `docs/design/`: `today.png`, `people.png`, `calendar.png` — the redesigned Today, People and Calendar screens. Read all three before you start, and look at them again before you build each corresponding screen. Treat them as the target for layout, density, hierarchy and spacing.

Where an image and this text disagree, the text wins — the images are one rendering of it. Do not copy pixel positions out of the images by eye; use the measurements in Part 3.

## Part 1 — How to work

This is a long autonomous run. These rules apply for the whole task:

Never stop to ask a question. Do not pause, do not wait for input, do not end your turn to check in.

When something is ambiguous, blocked, or risky, append it to `QUESTIONS.md` at the repo root:

```
## Q<n> — <one-line title>

**Where:** <file / component / section>

**What I need to know:** <the question>

**What I did instead:** <the assumption that let you keep moving>

**Cost of getting it wrong:** <low / medium / high, and why>
```

Then immediately move to a different part of the project. Never let one unknown stall the run. A hundred or more deferred questions is fine and expected — I would rather answer a long list at the end than be interrupted.

Make the assumption that lets you keep building, and leave a `// TODO(Q<n>)` comment at the site.

Commit in small, logically grouped commits as you go.

Write down what you decide, as you decide it. This run is long enough that your context will compact and you will lose the early reasoning. Maintain a `docs/redesign-log.md` with: what you found when you read the repo (framework, router, styling system, where tokens live), the exact token names you settled on, any place where the real codebase forced you to deviate from this brief, and which step of Part 9 you are on. Update it at the end of every step, not at the end of the run. When you resume after a compaction, read that file plus this brief before doing anything else.

If a step is large enough to fan out — the responsive pass, the states pass, the contrast pass — use subagents for the parallel parts, but keep the token layer and the shell in the main thread. Those two are where consistency matters most and where a subagent's independent judgement will drift.

When the run is finished, output the complete contents of `QUESTIONS.md` as your final message. Do not summarise — give me every question. I will answer them in one pass and hand the answers back so you can resume.

## Part 2 — Information architecture

Replace six data-type destinations with five organised around the daily loop: see what matters → act on it → feed the system.

| New | Was | What changes |
|---|---|---|
| Today | Brief | One ranked stack. Every item carries the action that resolves it. |
| People | People | Relationship health is the primary view. Childcare requests become a tab. |
| Calendar | Calendar | Week view by default. Custody becomes a named ribbon. Weather on day headers. |
| Plan | Activities | The weekend planner is the page; the activity library moves to a side rail. Meals ride along. |
| Gifts | Gifts | Grouped by person and occasion on a 90-day timeline, not an idea feed. |

Out of primary nav:

- Settings → an avatar menu at the bottom of the sidebar.
- Notifications → the bell moves from the bottom-left corner to the top-right of the header.
- Quick capture → the corner sparkle button is replaced by a persistent command bar in the header: an input reading "Ask, add, or dump a thought…" with a mic icon and a ⌘K hint. ⌘K / Ctrl+K opens it from anywhere; Esc closes it.

### Today

Header: date eyebrow, "Brief built HH:MM AM", a serif headline stating the day's situation in one sentence, a one-line subhead, and a ghost Rebuild button on the right.

Body: a vertical stack of priority cards, most urgent first. Each card has an icon well, a category tag, a metadata line, a one-sentence headline, optional supporting detail, and one primary button plus one or two ghost buttons. A card with no action does not belong on this page — if the system has nothing you can do about it, it is not a brief item.

Category tags with fixed colour meanings: Reach out (slipping), Decide (custody-you tint), Quick (neutral), Settled (settled).

Right rail, 342px: "Your day" (today's events, and an explicit line when the rest of the day is empty), "Coming up" (next occasions with gift status), and a "Relationships holding" panel with a small bar chart and a one-sentence read.

Close the stack with a plain line: "That is everything. N low-priority items are waiting in Plan."

### People

Table view, not a grid of name chips. Columns: Person (avatar, name, relationship) · Rhythm (7 of 5 days plus a progress bar coloured settled or slipping) · Last contact · Next thing · action button. Rows past cadence get a slipping-tinted border and a filled primary button; everyone else gets a ghost button.

Tabs above the table: Circle · Kids & custody · Childcare · Archive. A slim strip below the table surfaces open childcare requests and links into that tab.

Right pane, 320px: the selected person — avatar, name, relationship, next occasion, Text / Call / Add buttons, a contact-history bar chart with a one-line read, interest chips, a gift shortlist, and the most recent dictated note pinned to the bottom.

### Calendar

Default to Week. Segmented control: Day · Week · Month · Agenda.

Custody ribbon above the day headers: continuous named bands ("With you — through Saturday 4:00 PM", "With Mel") in the custody colours, replacing the current unlabelled bars.

Weather strip between day headers and the grid: one temp and condition per day, with days whose weather rules out outdoor plans rendered in the slipping colour.

Time grid 6 AM – 10 PM. Events are solid blocks; LifeOS suggestions are dashed-border ghost blocks in the action colour, accepted in place. A thin current-time line in the action colour on today's column. Weekend columns get a subtly darker ground.

Sidebar gains a Layers legend: you / Mel / work / childcare / suggested.

### Plan

Header: "This weekend", the date range, and the custody state.

A weather banner when the forecast constrains plans, stating plainly what it rules out.

Saturday and Sunday sections, each a list of scored proposals and empty slots. A proposal shows its score as a serif numeral, the title, attribute chips (indoors/covered, drive time, duration, relationship reason), and Add / Swap buttons. Empty slots are dashed and offer the two next-best options inline.

A "Dinners this week" strip at the bottom: seven day cells, unplanned days visibly empty.

Right rail: the activity library with each activity's live score, greyed out with the reason when ruled out ("Needs dry · ruled out this weekend"), plus a short panel explaining how scoring works.

### Gifts

Grouped by person and occasion, never an undifferentiated feed.

A 90-day timeline at the top with a marker per occasion; the nearest is filled in the action colour and its segment of the line is drawn in it.

Group header: avatar, "Fritz — birthday", date and days remaining, an order-by date, budget range, spend bar, and an order-status badge.

Idea cards in a four-column grid: thumbnail, title, and one sentence saying why it fits this person — grounded in something known about them, and naming conflicts with other ideas. Then price, and Buy / Drop.

Groups with no ideas get a real empty state that says what the system needs from the user.

Sidebar: a year-to-date gift budget card.

## Part 3 — Design system

### Type

Display: Instrument Serif (fallback Georgia, 'Times New Roman', serif), used only for page titles, the daily headline, and numerals acting as figures (scores, dates, dollar totals). UI: Manrope (fallback 'Helvetica Neue', Arial, sans-serif) for everything else. Both from Google Fonts. Remove Geist.

| Role | Size / line-height | Weight | Tracking |
|---|---|---|---|
| Daily headline | 40 / 1.08 | 400 serif | -0.018em |
| Page title | 34 / 1.0 | 400 serif | -0.015em |
| Card headline | 17 / 1.3 | 700 | -0.015em |
| Body | 14.5 / 1.5 | 500 | 0 |
| Row label | 14.5 / 1.2 | 700 | 0 |
| Metadata | 12 / 1.4 | 600 | 0 |
| Section label | 10.5 | 800 | 0.11em, uppercase |
| Tag | 10.5 | 800 | 0.09em, uppercase |

Body copy never exceeds 62 characters per line. Use `text-wrap: pretty` on headlines.

### Geometry

Radii: 6 chips and tags · 9 controls · 11 inputs · 13–14 cards · 17 sheets and modals. Spacing scale: 4 / 8 / 12 / 18 / 26 / 34. Nothing off this scale. Control heights: 30 compact · 36 default · 44 minimum on touch. Borders are 1px hairlines. No shadows in dark mode; at most one soft shadow on raised white cards in light mode.

### Layout

Sidebar 244px. Page padding 34px horizontal, 26–30px top. Header bar 72px, separated by a hairline. Main-to-rail gap 26–30px.

Use flex and grid with gap everywhere. Do not space siblings with margins or source whitespace — gap survives reordering and deletion; margins do not.

### Component anatomy

**Priority card (Today).** Padding 20px 22px, radius 14, 1px border. Row: 38×38 icon well (radius 10, role-tinted background at ~12%) · 18px gap · content column with 9px gaps. Content order: tag row (tag + 10px gap + metadata) → 17px headline → optional detail block → 8px button row. A card with only a one-line item collapses to 15px 22px padding and a single horizontal row.

**Button.** Height 36, padding 0 16px, radius 9, gap 7 between icon and label, 13.5/700 label. Primary: action background, on-action text. Ghost: transparent, ink-2 text, line-strong border. Disabled: meta text, line border, no background change. Destructive: slipping-tinted background and text.

**Tag.** Height 21, padding 0 9px, radius 6, 10.5/800 at 0.09em uppercase, role-tinted background and foreground.

**Table row (People).** Grid 210px 124px 112px 1fr 76px, 16px gap, 14px 16px padding, radius 12, transparent 1px border that becomes visible on hover. Avatar 36×36, radius 11, 12.5/800 initials. Rhythm cell: 12.5/700 label, 5px gap, 4px-tall track with a 3px radius fill.

**Event block (Calendar).** Absolutely positioned inside a relative day column, `left: 5px; right: 5px`, radius 8, padding 7px 9px. Title 12/700, meta 11/600 at 72% opacity. Hour rows are 46px tall with a 1px top hairline. Suggestions use a 1.5px dashed border and no fill beyond a faint action tint.

**Gift card.** Radius 13, 1px border, 96px thumbnail band, body padding 13px 14px 14px with 7px gaps, price 14/800 on the left of the action row.

**Rail card.** Padding 18px 18px 16px, radius 14, section label then 11–13px gap then content.

**Command bar.** Height 40, radius 11, 0 14px padding, search icon then placeholder at 13.5/500 in meta, mic icon in action and a ⌘K kbd chip pushed right. Max width 520px in the header; full width in the ⌘K overlay.

### Icons

Stroke-based inline SVG on a 24px grid, 1.7 stroke width, round caps and joins, rendered at 15–21px. One consistent family. No emoji anywhere in the product UI.

### Voice

Address the reader as you. Lead with the consequence, not the measurement — "You are two days past the point where a check-in still feels natural", not "7 days since last contact". Never explain the obvious back to the user. When the assistant made a judgement call, show the single fact it rested on. Rewrite existing copy to this standard as you touch each screen; the current copy explains its own reasoning at length and should get shorter.

## Part 4 — Colour

Colour carries meaning, and each role means exactly one thing:

- **action** — the one thing to press. Never decorative, never a passive state.
- **settled** — inside the rhythm, done, all good.
- **slipping** — a relationship past its cadence. Not an error colour; errors get their own destructive treatment.
- **custody-you / custody-mel** — the two custody parents, and nothing else anywhere in the app.

Implement three palettes as CSS custom property sets, each with full light and dark variants, switchable at runtime — a `data-palette` attribute on `<html>` alongside the existing light/dark mechanism. Add a palette picker in Settings under Appearance, next to Light/Dark/System. Persist the choice. Ship warm-evening-desk as the default.

No hex value appears in a component. Everything resolves through a token.

### warm-evening-desk — quietest, default

| Token | Dark | Light |
|---|---|---|
| ground | #131211 | #F7F3EC |
| surface | #1B1917 | #FFFFFF |
| surface-2 | #211F1D | #F2EDE4 |
| line | #292724 | #E5DED2 |
| line-strong | #322F2B | #D8CFC0 |
| ink | #F1ECE4 | #1B1815 |
| ink-2 | #B5AEA4 | #625B51 |
| ink-3 | #A39C92 | #6E6659 |
| meta | #7E776E | #8E877D |
| action | #E08A3C | #B96A22 |
| on-action | #1A1206 | #FFF8EF |
| settled | #7C9A72 | #5F7D51 |
| slipping | #C4634A | #A9452F |
| custody-you | #4E8A90 | #3A6F75 |
| custody-mel | #96759F | #7A5A83 |

### sunrise-citrus — brightest; designed light-first

| Token | Light | Dark |
|---|---|---|
| ground | #FFF8EF | #1B1512 |
| surface | #FFFFFF | #261E19 |
| surface-2 | #FFF3E4 | #2E241E |
| line | #F0E1CE | #3A2C24 |
| line-strong | #E3D2BB | #493831 |
| ink | #2A1E15 | #FBF1E6 |
| ink-2 | #6B5B4C | #CBB6A5 |
| ink-3 | #7D6C5B | #B29B89 |
| meta | #96836F | #9C8878 |
| action | #E0631A | #F97A2E |
| on-action | #FFF8EF | #2A1206 |
| settled | #2F9968 | #45B87F |
| slipping | #D24440 | #EC5B57 |
| custody-you | #1D8FB0 | #33A8C7 |
| custody-mel | #B8529A | #D06BB4 |

For this palette, light is the primary mode — if the user picks sunrise-citrus while set to System and the OS reports no preference, default them to light.

### harbor-bright — cheerful but grown-up; marigold on harbour blue

| Token | Dark | Light |
|---|---|---|
| ground | #0F1A21 | #F3F8FA |
| surface | #16242D | #FFFFFF |
| surface-2 | #1C2C36 | #EBF3F6 |
| line | #233743 | #DBE7ED |
| line-strong | #2F4757 | #C7D8E0 |
| ink | #EDF4F7 | #0F1D25 |
| ink-2 | #A9C0CB | #4C6674 |
| ink-3 | #8FA8B5 | #5A7482 |
| meta | #718A98 | #5F7A88 |
| action | #FFC13B | #C98600 |
| on-action | #241800 | #FFFDF6 |
| settled | #4ECBA0 | #1D9B77 |
| slipping | #FF7A6B | #D9503F |
| custody-you | #3EC0D6 | #1B8496 |
| custody-mel | #C58BE8 | #8E52B8 |

### Derived tints

Do not invent extra colours. Where a tag, icon well, or panel needs a soft background, derive it from its role colour:

- Soft background: the role colour at ~12% opacity over ground in dark, ~10% over surface in light.
- Soft foreground: the role colour moved toward ink until it passes contrast against that soft background.

## Part 5 — States, density and motion

Every screen needs all four states designed, not just the happy one.

**Loading.** Skeletons that match the real layout's shape and height — same card heights, same column widths — so nothing shifts when data lands. No spinners on full pages. Never show a layout that reflows after load.

**Empty.** An empty state says what the system needs and gives one action. "No gift ideas saved, and no interests on file for her yet. Tell me three things she is into and I will have a shortlist by the weekend." — never a bare "No results". Empty-by-success ("Nothing needs you today") reads differently from empty-by-absence ("You haven't added any activities yet"); write both.

**Error.** Inline and specific, scoped to the thing that failed, with a retry. A failed brief rebuild does not blank the page — it keeps the last brief and says it is stale. Errors use a destructive treatment, never the slipping colour.

**Partial / stale.** When data is older than expected, say so in the metadata line rather than hiding it.

**Read-only.** The app is multi-tenant and permission-aware. Where a viewer lacks write access, render controls as disabled with a reason on hover rather than hiding them, except for destructive actions, which are hidden.

**Density.** One idea per card. If a card needs two headlines it is two cards. Any list longer than about seven items gets grouping or a filter, not just more scroll. Prefer showing fewer things well over showing everything.

**Motion.** Transitions are 120–180ms with an ease-out curve, and only on colour, opacity and transform. No layout animation, no bouncing, no staggered list entrances. Accepting a suggestion animates the ghost block to solid; that is the one moment worth a flourish. Respect `prefers-reduced-motion: reduce` by dropping all of it.

## Part 6 — Responsive

Three breakpoints. Design each deliberately; do not just let the desktop layout squeeze.

**≥1280px — full.** As specified above: 244px sidebar, content, right rail.

**768–1279px — no rail.** The right rail's content moves inline. On Today it becomes a horizontal row of two or three compact cards above the priority stack. On People the detail pane becomes a slide-over sheet. On Plan the activity library moves below the itinerary. The sidebar collapses to a 72px icon rail with labels on hover.

**<768px — phone.** Sidebar becomes a bottom tab bar: Today · People · capture (a 52px circular action-coloured button, centred, with the mic icon) · Calendar · Plan. Gifts moves into an overflow or the People tab. All controls go to 44px minimum. The calendar defaults to Day, not Week. Tables become stacked cards.

Do not draw a fake status bar or fake keyboard on mobile — the real ones render on top.

The page body never scrolls horizontally at any width. Tables, the calendar grid, and the gift timeline each scroll inside their own `overflow-x: auto` container. Keep at least 16px of side gutter at every width.

## Part 7 — Do not do these

These are the specific failures of the current design. Do not reproduce them:

- A card without an action. Prose that reports a fact and offers no way to resolve it belongs in the rail or nowhere.
- Equal visual weight for unequal items. Four identical grey cards tell the user nothing about what to do first.
- Truncated repeated labels. A month grid where every day reads `12:00a…` is worse than an empty grid.
- Unlabelled colour. A coloured bar with no name is decoration. Custody bands, weather, and scores all carry their label.
- Feeds sorted by ingestion time. Group by the thing the user is thinking about — the person, the occasion — not by when the row was written.
- Settings-grade content in primary navigation. If it is opened twice a year it is not a destination.
- Hiding the fastest action. Capture is the most-used thing in the product; it is never smaller or less visible than any other control.
- The assistant narrating its own reasoning at length. One supporting fact, then stop.

## Part 8 — Definition of done

- All three palettes pass WCAG AA (4.5:1) for body text and 3:1 for large text and UI boundaries, in both light and dark. Where a pairing fails, adjust the derived tint, not the role colour, and log the change in QUESTIONS.md.
- No colour, font size, radius, or spacing value is hardcoded in a component; everything resolves through a token.
- Every screen works at 400px, 900px and 1440px with no horizontal body scroll.
- All touch targets are 44px or larger below 768px.
- Loading, empty, error and read-only states exist for every screen.
- Every existing feature still works: custody calendar, childcare requests, gift save/dismiss, activity CRUD, brief refresh, notification bell, every Settings field.
- Keyboard: ⌘K / Ctrl+K opens capture, Esc closes it, the Today stack is arrow-navigable, and its primary action fires on Enter. Visible focus rings throughout, in the action colour.
- `prefers-reduced-motion` is respected.
- Screen-reader pass: the custody ribbon, weather strip, rhythm bars and scores all have text equivalents. Colour is never the only carrier of meaning.
- The build passes and the app deploys.

## Part 9 — Order of work

Commit after each step.

1. Read the repo and write down what you found. Install the fonts, build the three palette token sets with the light/dark switch and the Settings picker, and define the type, spacing, radius and control-height tokens. Get the token layer completely right before touching a single screen — everything after this step is cheap if this step is correct and expensive if it is not.
2. Rebuild the primitives against those tokens: button, tag, card, rail card, input, table row, segmented control, avatar, empty state, skeleton.
3. Shell: sidebar, header command bar, ⌘K overlay, notification and avatar placement, nav reorder.
4. Today.
5. People.
6. Calendar.
7. Plan — the largest change, since Activities is absorbed here.
8. Gifts.
9. Settings, including the Appearance section.
10. Responsive pass: 768–1279, then below 768, across all five screens.
11. States pass: loading, empty, error, read-only, everywhere.
12. Accessibility and contrast pass across all three palettes in both modes.
13. Output the full contents of `QUESTIONS.md`.

If you finish a step and the next one is large, say which step you are starting before you start it, so the log stays readable. Do not stop to ask whether to continue.
