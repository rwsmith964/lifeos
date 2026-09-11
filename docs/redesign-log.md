# Redesign log

Maintained per `docs/redesign-brief.md` Part 1. Updated at the end of every Part 9 step, not at
the end of the run. On resume after a compaction: read this file and the brief before doing
anything else.

## Repo read (before Step 1)

- **Framework/router:** Next.js 16.3.1, App Router. Route groups: `app/(app)/**` (authenticated
  shell + pages), `app/(app)/layout.tsx` is where the shell/nav lives today. Root layout at
  `app/layout.tsx`.
- **Styling system:** Tailwind CSS v4, CSS-first config — no `tailwind.config.*` file exists.
  Tokens live in `app/globals.css` as plain CSS custom properties on `:root` / `.dark`, then
  re-exposed to Tailwind via an `@theme inline { --color-x: var(--x); ... }` block, which is what
  makes `bg-background`, `text-muted-foreground`, etc. exist as utilities. This is the exact
  mechanism this redesign extends — new tokens go through the same two-step pattern (raw CSS var
  → `@theme inline` re-export).
- **Current tokens:** stock shadcn/ui defaults, OKLCH-based (`--background: oklch(1 0 0)` etc.),
  one `--radius: 0.625rem` base that `radius-sm/md/lg/xl` are all `calc()`'d from. Confirms the
  brief's Context section exactly ("near-black shadcn/ui default theme ... `--radius: 0.625rem`").
- **Fonts:** `next/font/google` `Geist` + `Geist_Mono` in `app/layout.tsx`, exposed as
  `--font-geist-sans` / `--font-geist-mono`, mapped to Tailwind's `--font-sans`/`--font-mono` in
  the `@theme inline` block. Brief says remove Geist entirely, replace UI face with Manrope,
  add Instrument Serif for display/serif-numeral roles.
- **Light/dark switching:** `next-themes`, `attribute="class"` (adds/removes `.dark` on `<html>`),
  wrapped in `components/theme-provider.tsx`, toggled by `components/theme-toggle.tsx` (a 3-way
  Light/Dark/System segmented control) rendered on the Settings page under an "Appearance" card.
  This is the mechanism the brief says to add `data-palette` "alongside" — decision: next-themes
  itself only manages one attribute cleanly, so palette gets its own small sibling
  provider/hook (`components/palette-provider.tsx`) mirroring next-themes' own approach
  (inline pre-hydration script to prevent a flash of the wrong palette, localStorage persistence),
  rather than fighting next-themes into managing two unrelated concerns.
- **Nav / shell:** `app/(app)/layout.tsx`. Today it renders: a `lg:` desktop sidebar (`lg:w-60`,
  logo/household name, 6 nav links, a footer row with the notification bell + sign-out), and a
  separate mobile header + fixed bottom nav below `lg`, both built from the same `NAV_ITEMS`
  array. `CaptureButton` (the current quick-capture "sparkle" trigger) floats independently of
  both. This whole file is the Step 3 ("Shell") target.
- **Primitives:** `components/ui/` — `button.tsx` (CVA, variants default/destructive/outline/
  secondary/ghost/link, sizes default/sm/lg/icon), `card.tsx`, `input.tsx`, `label.tsx`,
  `badge.tsx`, `separator.tsx`, `textarea.tsx`, `confirm-delete-button.tsx`, `dialog.tsx`,
  `rendered-markdown.tsx`, `timezone-combobox.tsx`, `toast.tsx`. Small, clean set — this is the
  Step 2 rebuild target, in full.
- **No `tailwind.config.*`, no separate design-tokens file** — `app/globals.css` is the single
  source of truth for the whole visual system today, and remains so after this redesign.

## Step 1 decisions (token layer)

- **Old shadcn token names are kept and re-pointed, not deleted, during the transition.**
  `--background`, `--foreground`, `--card`, `--primary`, `--muted-foreground`, `--border`, etc.
  still exist and now resolve to sensible equivalents derived from the new role tokens (e.g.
  `--background` → `ground`, `--card`/`--popover` → `surface`, `--primary` → `action`,
  `--muted-foreground` → `meta`, `--border` → `line`). This means the moment Step 1 lands, every
  screen not yet individually rebuilt (Steps 4-9) still renders correctly and already inherits the
  new colour system and fonts, rather than looking broken/unstyled until its dedicated step. Every
  *new* component built from Step 2 onward uses the brief's own token names directly
  (`bg-surface`, `text-ink-2`, `border-line`, `bg-action text-on-action`, etc.), never the old
  shadcn names. By the end of Step 9 nothing in `app/`/`components/` should reference the old
  names at all; they can be deleted then. Logged here so a resumed session knows this is
  deliberate layering, not leftover dead code.
- **Spacing scale naming.** The brief specifies raw values (4/8/12/18/26/34) but not token names.
  Tailwind v4's default spacing scale is a single `--spacing: 0.25rem` multiplier applied to *any*
  integer utility suffix (`p-18` already means `18 × 0.25rem = 72px` out of the box) — reusing the
  bare numbers 4/8/12/18/26/34 as spacing keys would silently collide with that existing
  bare-number scale used all over the current codebase (`gap-4`, `px-6`, `pb-36`, etc. — pb-36
  alone appears in the shell, D-079). Decision: named tokens instead —
  `--spacing-2xs 4px / -xs 8px / -sm 12px / -md 18px / -lg 26px / -xl 34px`, giving utilities
  `p-2xs`, `gap-md`, etc. that coexist with the untouched numeric scale. New components use the
  named scale exclusively; existing untouched components keep using the numeric scale until their
  own step rebuilds them.
- **Radius.** Brief wants distinct, non-derived radii per category (6 chip/tag, 9 control,
  11 input, 13-14 card, 17 sheet/modal) rather than shadcn's one-base-`calc()` scheme. Added
  `--radius-chip/-control/-input/-card/-sheet` and mapped each into `@theme inline` as its own
  Tailwind radius key (`rounded-chip`, `rounded-control`, etc.). Left the old `--radius`/
  `radius-sm/md/lg/xl` in place, re-based close to "control" sizing, for any not-yet-migrated
  component.
- **Fonts.** Instrument Serif (Google Fonts) ships weight 400 only, with an italic — matches every
  type-table role that uses it (all specify weight 400). Manrope (Google Fonts, variable
  200-800) covers every UI weight the type table needs (500/600/700/800) from one font load.
  `--font-sans` (Tailwind's default UI font mapping) now points to Manrope; a new `--font-serif`
  token points to Instrument Serif, used only where Part 3 specifies it (display/page-title/
  figures) — never a blanket Tailwind default, so ordinary body text can't accidentally pick it up.
- **Palette default / system-preference nuance.** `sunrise-citrus` is explicitly light-primary per
  the brief ("if the user picks sunrise-citrus while set to System and the OS reports no
  preference, default them to light"). Implemented in `palette-provider.tsx`'s resolution logic,
  not left to next-themes' own default dark-leaning system-preference fallback.

## Deviations from the brief so far

- None yet beyond the two naming decisions above (spacing-scale token names, radius token names)
  — the brief left both unnamed, so this isn't a deviation from a stated value, just filling in a
  naming gap the brief didn't specify.
- RQ2 (`QUESTIONS.md`): added one extra token, `destructive`/`on-destructive`, per palette — not
  in Part 4's tables but required by Part 5/7's "errors are never the slipping colour" rule.

## Step 1 — done

Built: `app/globals.css` (full token layer: geometry/spacing/motion in a plain `@theme` block;
15 role tokens + `destructive`/`on-destructive` × 3 palettes × light/dark as CSS custom properties
gated by `[data-palette]`/`.dark`; derived soft-tint pairs via `color-mix()`; the legacy shadcn
token names re-pointed at the new roles instead of deleted; the full Part 3 type scale as paired
Tailwind `--text-*` theme keys), `app/layout.tsx` (Manrope + Instrument Serif via `next/font/
google`, Geist removed, `PaletteProvider` wired in alongside the existing `ThemeProvider`),
`components/palette-provider.tsx` (new — palette switching + persistence + no-flash script,
mirroring next-themes' own approach; `usePalette()`/`PALETTES`/`PALETTE_LABELS` exported for the
Step 9 Settings picker).

**Verified:** `pnpm typecheck` clean, `pnpm lint` clean, `pnpm build` succeeds (every route
compiles against the new CSS, confirming the token layer itself — the `@theme`/`@theme inline`
split, the `color-mix()` derived tints, the palette attribute selectors — is structurally sound).
`pnpm test`: 854/859 passing; the 5 failures (`lib/planner/seasonality.test.ts` and two other
files) are pre-existing on `main` before any redesign change — confirmed by stashing all redesign
work and re-running, same 5 failures. Not a redesign regression, not touched; out of scope for
this brief (business logic, not visual system).

Not yet done, deliberately deferred to their own Part 9 steps: no component has been rebuilt
against the new tokens yet (Step 2), the Settings palette picker UI doesn't exist yet (Step 9,
though `usePalette()` is ready for it), and the WCAG contrast audit of all three palettes (Step 12)
hasn't run — the soft-tint mix percentages in particular are an approximation flagged for that
pass, not a verified-passing value yet.

## Step 2 decisions (primitives)

- **Restyle prop VALUES, don't rename them.** `components/ui/*` primitives (Button, Card, Badge,
  Input, …) are used across ~15+ routes outside the brief's five named screens (Household,
  Opportunities, Packing, Execution, Ambient, Brain Dump, childcare, trip ideas, notifications,
  onboarding, auth pages, …). Renaming a variant/size prop (e.g. `default` → `primary`) would break
  every one of those call sites' typecheck, forcing a mechanical edit across the whole app just to
  keep it compiling — well beyond "do not change ... the API surface ... except where a section
  explicitly moves." Every primitive keeps its exact pre-redesign prop *values*; only the CSS each
  value resolves to changes, now built from the new tokens and matching Part 3's anatomy as closely
  as the existing API allows. `Button`'s `outline`/`ghost` (previously visually distinct) now both
  render Part 3's one specified non-primary treatment, since Part 3 only describes one.
- Breakpoint mapping for the whole redesign: the brief's 768px/1280px breakpoints are Tailwind v4's
  *default* `md`/`xl` exactly (`--breakpoint-md: 48rem`, `--breakpoint-xl: 80rem`) — confirmed, no
  custom breakpoints needed. Base (no prefix) = phone (<768), `md:` = "no rail" tier (768-1279),
  `xl:` = full desktop (≥1280) throughout every component and the Step 10 responsive pass.
- Control-height responsiveness (44px minimum below 768px, Part 8 Definition of Done) is baked
  into primitives now rather than deferred to Step 10 — e.g. `Button`'s default/lg sizes are
  `h-control-touch md:h-control-default`. Cheap to do once at the primitive level; expensive to
  retrofit onto every screen individually later.

## Step 2 — done

Restyled (API-compatible, see decision above): `Button`, `Badge` (the brief's "Tag"), `Card`/
`CardTitle`/`CardDescription`, `Input`, `Textarea`, `Label`. Built new: `PriorityCard` (Today's
core unit — always requires an `actions` prop, so a card literally cannot exist without one, per
Part 7's "a card without an action doesn't belong"), `RailCard`, `Avatar`, `TableRow` +
`RhythmCell` (People's row anatomy), `SegmentedControl` (generalized from the pre-existing
`theme-toggle.tsx` pattern, not yet migrated onto it), `EmptyState`, `Skeleton`.

**Real bug found and fixed via live verification, not caught by typecheck/lint/build:** the
initial spacing-scale token names (`--spacing-2xs/-xs/-sm/-md/-lg/-xl`) silently broke every
`max-w-sm`, `w-lg`, and similar utility across the *entire app* — Tailwind v4 shares one namespace
across every spacing-derived sizing utility (padding, gap, width, height, max-width, min-width,
size, …), and its own default preset already defines `sm`/`md`/`lg`/`xl` under that exact
namespace for max-width-style scales. My same-named keys overwrote those instead of adding new
ones. First caught visually: the login page's card collapsed to a ~12px width in a live dev-server
screenshot. Confirmed via direct computed-style inspection (`max-w-sm` resolving to `12px`
instead of its real value). Fixed by renaming the whole scale to pixel-suffixed keys
(`--spacing-4px` … `--spacing-34px`), which can't collide with any word-based Tailwind default.
None of the Step 2 components had actually consumed the broken names yet (confirmed by grep before
fixing), so the fix was contained entirely to `globals.css` with zero component changes needed.
**Lesson for the rest of this run:** always live-verify a token/CSS change in the browser, not just
typecheck/lint/build — none of those three caught this; only rendered output did.

A second, unrelated syntax bug was introduced *while writing the fix's own explanatory comment*:
the comment literally contained the substring `*/` (from writing wildcard utility patterns like
"p-*/gap-*/w-*" slash-separated), which prematurely closed the CSS comment block and broke parsing
CSS-syntax-error style (unclosed bracket, confirmed via a real build error in the dev server and a
brace/comment-balance check). Rewrote the comment to avoid any `*` immediately followed by `/`.
Worth remembering for the rest of this run: CSS comments in this file describe utility-class
patterns often enough that this could recur — check for `*/` inside comment bodies specifically
when a comment mentions multiple wildcard-style Tailwind classes.

**Verified:** `pnpm typecheck`/`pnpm lint`/`pnpm build` all clean after both fixes. `pnpm test`:
854/859, same pre-existing 5 failures as Step 1 (unrelated, unchanged). **Live-verified in the
browser** (not just build-checked): started the dev server, confirmed the login page renders
correctly (correct card width, correct warm-evening-desk dark palette colours, correct Manrope
font, correct focus ring in the action colour on the password field), signed in with the real
account, confirmed the authenticated shell (still using the pre-redesign sidebar/nav — that's Step
3) already renders every existing card/button through the new token system with no visual
breakage, matching the intended "legacy bridge" effect from Step 1.

## Self-verification tooling (per Richard's guidance mid-run)

Richard shared external guidance recommending a screenshot-based self-check loop rather than
trusting a self-report that a screen "looks right" — built `scripts/shot.mjs`: starts the dev
server if needed, logs in once (`LIFEOS_SHOT_EMAIL`/`LIFEOS_SHOT_PASSWORD` in `.env.local`, cached
Playwright storage state at `docs/shots/.auth-state.json`, both gitignored), navigates to a route,
saves a screenshot to `docs/shots/<name>.png`. Two real bugs hit and fixed while building it: (1)
every real route in this app is session-gated, which the first draft didn't handle at all — added
the login+cache step; (2) Git Bash's MSYS path-conversion mangled a bare `/` route argument into a
Windows path (`node scripts/shot.mjs today /` silently became `.../today C:/Program Files/Git/`)
— worth remembering for every future invocation: prefix with `MSYS_NO_PATHCONV=1` when the route
argument is `/` or starts with `/`. Verified working end to end: real screenshot of the (still
pre-redesign) Today page saved and inspected.

The brief's three reference images (`docs/design/today.png`/`people.png`/`calendar.png`, RQ1) still
don't exist in the repo — Richard says he's providing them in an upcoming message. Until they
land, Today/People/Calendar get built from the brief's text spec (Part 2 + Part 3 anatomy) with
`shot.mjs` used as a self-consistency check (screenshot → compare against the written spec, not a
pixel target → fix → repeat). Once the real images arrive, re-run the comparison against them
specifically for those three screens.

## Reference images received (mid-Step-3) — captured in full detail, not yet saved to disk

Richard pasted 6 images inline in chat: People (dark, x2 identical), Calendar week view (dark),
Plan (dark), Gifts (**light** mode — the first live look at the light palette), Today (**mobile**
only, dark). No desktop Today image was included. These are NOT yet files on disk — no matching
PNG found anywhere searchable (checked temp dirs, `.claude`, scratchpad) — only visible as inline
chat content this turn, which will not survive a compaction. Asked Richard to also save the actual
files into `docs/design/` for persistence and for `scripts/shot.mjs` pixel comparison later. Wrote
down everything visible below so this turn's read of them isn't lost even if the files never land.

**Confirms/refines vs. the brief text and my Step 1/2 token choices:**
- My custody-you (teal) / custody-mel (purple/violet) hex choices visually match the reference
  almost exactly — no change needed.
- **Rhythm is a 3-tier system, not the binary "settled or slipping" the brief's People section
  literally says**: the People table shows green (settled, e.g. "2 of 7 days", "11 of 30 days"),
  **amber/warning** (e.g. Em "5 weeks, 1:1" — approaching but not yet over cadence), and red
  (slipping, e.g. "7 of 5 days" — already over). The mobile Today headline ("Two people are
  slipping") only counts the red ones, confirming amber is a real, distinct third state, not a
  rendering quirk. `RhythmCell` (built in Step 2) currently only supports settled/slipping —
  **needs a third `warning` state added before People (Step 5) is built.** Not logging this as an
  RQ since it's the image adding detail the brief's text didn't rule out, not contradicting it.
- Today's category tags confirmed exactly as the brief states: "Reach out" = slipping tint,
  "Decide" = custody-you tint (not a generic action tint) — visible directly in the mobile shot.
- Notification bell + avatar confirmed top-right of header, exactly as Part 2 says.
- Command bar copy confirmed verbatim: "Ask, add, or dump a thought…" with a search icon, mic
  icon, and a ⌘K chip.
- Mobile bottom tab bar confirmed: Today · People · capture (raised circular button) · Calendar ·
  Plan — Gifts is not in it, matching Part 6's "Gifts moves into an overflow or the People tab."
- Gifts' empty-state group (Em, "nothing yet") uses almost the brief's exact Part 5 example
  copy verbatim ("Tell me three things she is into and I will have a shortlist by the weekend"),
  confirming that example was meant literally, not just illustratively.
- Weekend Plan's empty slots show two inline next-best options as ghost buttons suffixed with
  their own score ("Little Man date · 88", "Indoor range · 74") — a concrete interaction pattern
  the brief's text only described loosely ("offer the two next-best options inline").
- Activity library rail: a ruled-out activity shows no score at all (not a greyed "0" or dash-only
  number) — just the name + reason, no numeral slot.
- Gift idea cards use a simple tinted icon/line-illustration thumbnail band (fishing hook, coffee
  cup, trophy, golf cart, truck, person icon), not photos.
- Cal's group (no fixed occasion, "just because") uses **Save/Drop** buttons on its idea cards,
  while Fritz's group (a real upcoming occasion) uses **Buy/Drop** — the verb changes based on
  whether there's an active occasion driving the purchase, not a fixed per-card verb pair.

## Step 3 — done

Rebuilt `app/(app)/layout.tsx` entirely. Sidebar: 244px full (xl+, ≥1280), 72px icon-only rail with
labels-on-hover (md-xl, 768-1279), hidden below md (phone gets a bottom tab bar instead) — Part 6's
three tiers, confirmed against Tailwind v4's default `md`/`xl` breakpoints (768px/1280px exactly,
no custom breakpoints needed). New nav: Today/People/Calendar/Plan/Gifts, same routes as before
(`/activities` is now labelled "Plan" — not a new route, matching Part 2's table). Settings moved
into a new `AvatarMenu` (hand-rolled popover, click-outside + Escape, matching the existing
no-external-dependency convention already used by `dialog.tsx`) at the bottom of the sidebar.
Notifications moved to a bell in the header's top-right.

Quick Capture's trigger moved from a single floating corner button to two places — a persistent
header command bar (`components/capture/command-bar.tsx`, Part 3's exact anatomy: search icon,
placeholder, mic icon, ⌘K chip) on md+, and a raised circular mic button centred in the phone's
bottom tab bar (`components/capture/mobile-capture-button.tsx`) below md — plus a global ⌘K/Ctrl+K
shortcut and Escape-to-close from anywhere. The actual capture logic (turn history, dictation,
the `/api/capture` call, clarification/error handling) is the pre-existing `capture-button.tsx`
lifted verbatim into `capture-panel.tsx` and mounted once by a new `CaptureProvider` context, so
every trigger opens the same instance and the keyboard shortcut has something to open regardless
of which page is active. Old `capture-button.tsx` deleted (fully superseded, confirmed unused
first).

**Two real bugs found via live screenshot verification (`scripts/shot.mjs`), neither caught by
typecheck/lint/build:**
1. Passed the nav icons' component references (`Sun`, `Users`, etc.) as props into
   `MobileCaptureButton`, a Client Component — React RSC boundaries forbid passing functions/
   component references as props across server→client (only serializable data, including
   already-rendered JSX elements, crosses that boundary). Manifested as a full-page crash caught by
   `global-error.tsx` in the browser but invisible to `pnpm build` (the route is fully dynamic, so
   build never actually renders it — only a live request does). Fixed by pre-rendering the icons to
   JSX in the server component and passing `icon: ReactNode` instead of `icon: ComponentType`.
2. `scripts/shot.mjs` itself needed a fix mid-use: Next's dev-mode error overlay (distinct from the
   real app) can render full-screen over the sandbox's known benign "eval() blocked" console error,
   hiding the actual page from the screenshot — added an Escape-key-then-close-button dismissal step
   before capturing, matching what a real user would just do.

**Verified:** `pnpm typecheck`/`lint`/`test` (854/859, same pre-existing 5)/`build` all clean.
**Live-verified via real screenshots** (desktop 1440×980 and phone 390×844) of Today, then a
regression check on People/Calendar/Gifts (still pre-redesign content, correctly unchanged) to
confirm the new shell doesn't break any page it wraps. Desktop: sidebar, command bar, and bell all
render correctly and closely match the reference images. Mobile: header (logo/bell/avatar) and
bottom tab bar (Today·People·capture·Calendar·Plan) match the reference mobile shot closely.

## Step 4 — done

Rebuilt `app/(app)/page.tsx`. The old page rendered brief content as separate cards grouped *by
content type* (Today/Heads up/People/Opportunities/Household/Suggestion); the redesign wants one
ranked stack of actionable items instead. New pure transform
`lib/brief/today-priority-items.ts` (`buildTodayPriorityItems`) converts the same already-computed
data (nothing new fetched for this part — `content.people`/`headsUp`/`suggestion`, the existing
opportunities pipeline, the existing Module 8 household contributor) into `PriorityItem[]`, tagged
`reach_out`/`decide`/`quick` and ranked reach-out first, matching Part 2's fixed tag-colour mapping
and the mobile reference's card order. Every item carries a real href-backed action (Part 7: "a
card without an action doesn't belong") — reach-out items link to `sms:{phone}` when a phone
number is on file, else the person's own page; nothing fabricates a capability (real SMS sending)
the app doesn't have.

Right rail (342px, `RailCard`): "Your day" reuses `content.today` (now here instead of a main-column
card) with an explicit empty-day line; "Coming up" is new — `lib/gifts/occasions.ts`'s existing
`scanUpcomingOccasions` (already used by the Gifts feature) cross-referenced against existing
active gift suggestions for a real ready/not-ready count, not new business logic; "Relationships
holding" is a new household-level rollup over `listActiveCadencesForHousehold` +
`evaluateCadence` (both pre-existing), rendered as a small settled/slipping bar per person plus a
one-sentence read. Closing line's low-priority count is `rawOpportunities.length -
topOpportunities.length` — a real number from data already being fetched, not invented.

**Deviation, logged not asked (matches Part 1's protocol):** Part 2's header spec says "'Brief
built HH:MM AM'"; the one reference image available (mobile) shows date + weather in the eyebrow
instead, with no "Brief built" phrase visible, and no desktop Today reference exists to check
against. Kept the existing `generatedAtLabel` ("Updated 16 hours ago", relative time, already
computed) as its own line below the headline, and put weather in the eyebrow per the image. Not
logged as a numbered RQ (pure layout latitude within an already-ambiguous, unimageed area — no
functional risk either way).

**Verified:** typecheck/lint/test (854/859, pre-existing)/build all clean. **Live-verified** at
1440×1100 and 390×844 against Richard's real household data (not seed/demo data): tags, icon
wells, and card ranking all render correctly; the relationship bar chart correctly shows "0 of 2
on track" reflecting that both Jackie and Fritz are genuinely overdue in this real account;
"Coming up" correctly shows empty (no birthdates on file for anyone within 90 days in this real
household — expected, not a bug, since the reference mockup's occasion data was fictional demo
content).

## Step 5 — done

`components/ui/table-row.tsx`'s `RhythmCell` updated to the real three-tier system found in the
reference images: new `lib/people/rhythm.ts` (`evaluateRhythm`, pure/unit-testable like
`lib/contact/cadence.ts`) computes settled/warning/slipping from the same `target_interval_days`/
`last_contact_date` cadence data, warning being "≥70% of the way to due but not yet over."

Rebuilt `app/(app)/people/page.tsx` (server) + new `people-table-client.tsx` (client, tabs +
selection state). Replaced the old name-chip grid with the spec'd table: avatar/name/relationship,
rhythm bar, last contact, next thing, and a slipping-aware action button (filled "Reach out" vs
ghost "Open" per Part 2). "Next thing" is a new small presentational helper (not new business
logic) — next upcoming event this person attends (`listUpcomingEventsForPerson`, pre-existing) if
any within the near term, else their next birthday/anniversary within 60 days
(`nearestUpcomingOccasionForPerson`, pre-existing), else "—". Tabs (Circle/Kids & custody/
Childcare/Archive) are client-side filters over already-loaded data — small household, no benefit
to round-tripping the server per tab. Detail pane shows the selected person's interests (existing
`listInterestsForPerson`) and gift shortlist (existing `listActiveSuggestionsForHousehold`,
cross-referenced by person) — both pre-existing data, newly surfaced here.

**Scope note, not a numbered RQ:** rows sort alphabetically (existing `listPeopleForHousehold`
order), not slipping-first — Part 2 doesn't specify a sort order for the table the way Today's
stack explicitly does ("most urgent first"), so this wasn't treated as a spec gap. Worth
revisiting if Richard wants urgency-first sorting here too.

**Verified:** typecheck/lint/test(854/859, pre-existing)/build all clean. **Live-verified** at
1440×1000 against real household data: tabs, the three rhythm tiers (Jackie/Fritz correctly
"8 of 7"/"8 of 5" and slipping-red with a filled "Reach out" button; Cal/Em/Mel correctly "No
cadence set" with a ghost "Open" button), and the detail pane (real interests and gift shortlist
prices for Cal) all render correctly. Mobile (390×844): the fixed-column table grid doesn't yet
collapse to stacked cards (that's explicitly Step 10's job per Part 9) but correctly scrolls
within its own container rather than the page body, satisfying Part 8's Definition of Done bullet
about horizontal scroll even ahead of the dedicated responsive pass.

## Step 6 — done

`app/(app)/calendar/page.tsx` is a large, feature-rich existing page (month/week/day granularity,
travel-conflict detection, work schedules, time off, birthdays, weekend-plan integration, kid-linked
event visibility rules) -- kept every bit of that intact and additive, per the brief's "don't change
business logic" rule, rather than rewriting it fresh.

Changed: default range is now week (was month); added a fourth "Agenda" range (a flat
chronological list grouped by day, reusing the same already-computed `items`/`byDay` -- no new
data); segmented control reordered Day/Week/Month/Agenda; time grid default window changed from
7am-9pm to 6am-10pm (`lib/calendar/day-timeline.ts`'s `DEFAULT_WINDOW_*` constants only -- the
auto-expand-for-outlier-items safety behavior is untouched, so an event outside 6-22 still widens
the grid instead of being clipped); current-time line recolored from a hardcoded red to the action
token. New: a custody ribbon above the week view's day headers (`lib/calendar/week-custody-ribbon.ts`'s
`buildWeekCustodyRibbon`, one continuous named band per child, merging consecutive same-parent days
— the week-level counterpart to the pre-existing per-day `buildMonthCellCustodyBars`); a weather
strip between the day headers and the hour grid (real NWS forecast via the pre-existing
`getNwsForecast`/`scoreWeatherSuitability`, same home-address gate as every other weather feature
in this app, not gated on the `scheduling_v2` flag the travel-conflict banner uses since they're
unrelated capabilities); weekend columns get a subtly darker background; a Layers legend built from
real existing colours (custody parent colours, the pre-existing work/time-off dot colours) plus a
"Suggested by LifeOS" entry with no live data behind it yet (see gap below).

Removed the old Card's own duplicate prev/next/title header now that the page-level header (added
above the range/view toggles) carries that for every range, not just month.

**Real bug found and fixed via live screenshot verification, not caught by typecheck/lint/build:**
the custody ribbon's first draft positioned bands in plain flex document order, so every band
rendered stacked at the left of the row regardless of which actual days it covered (a Fri-Sat band
looked identical to a Mon-Tue one). Fixed by positioning each band absolutely by percentage
left-offset/width derived from its real `startDayIndex`/`endDayIndex`, confirmed against the actual
custody blocks rendered below it in the same screenshot.

**Real gap, not fabricated:** Part 2 calls for "suggestions" to render as dashed ghost blocks in the
action colour, but there is no existing data source for an "AI-suggested calendar item" distinct
from a real event/custody block/birthday/work-shift/time-off — the closest analog (the weekend
plan's recommended activity) lives in its own `<details>` panel, not as a calendar-grid item. Not
built; logged here rather than inventing fake suggestion data to fill the visual gap.

**Second regression caught and fixed:** changing the window default from 7-21 to 6-22 broke one
pre-existing `day-timeline.test.ts` assertion that hardcoded the old window's total-hours math
(19h vs. the new 20h) — caught immediately by the test suite (854→853 briefly), not silently
shipped; fixed the assertion's math, not the new behavior.

**Verified:** typecheck/lint/build clean; test suite back to the same pre-existing 5 failures
(854/859) after fixing the regression above. **Live-verified** at 1440px against real household
data across all four ranges: Week (default) shows the correctly-positioned custody ribbon, weekend
shading, and action-coloured current-time indicator; Month still renders correctly with no
duplicate header; Agenda groups real items by day correctly. Weather strip did not show live data
for this household in this pass -- consistent with the same home-address gate already observed
empty on the Today page this session, not a new bug specific to Calendar.

## Step 7 — done

Rebuilt `app/(app)/activities/page.tsx` (route unchanged, now labelled "Plan" in nav per Step 3) as
"This weekend" — the weekend planner is now the page, the activity library moved to a right rail,
per Part 2's table.

**Key design decision, not obvious from the brief's text alone:** Part 2 wants each day to show "a
list of scored proposals" with a real numeral score and attribute chips. The existing weekend-plan
system (`generateWeekendPlan`/`weekend_plans` table) only ever persisted a *single* AI-narrated
recommendation with no numeric score exposed anywhere in the UI — rebuilding its internals to
expose per-candidate scores would mean touching real business logic, which the brief says not to do
except where a section explicitly moves. Found a better fit already sitting in the codebase: the
opportunity-detection engine (D-061/D-070, `listOpenOpportunitiesWithSubjectForHouseholdInDateRange`
+ `getPresentedOpportunities`) already computes and persists a real per-candidate `score`, already
dedupes/tiers/caps them, and already backs the Opportunities page and Calendar's weekend nudge with
the exact same data — this became the proposals list instead, so every score/tier/reasoning shown
is real, not new business logic. New `plan-proposal-card.tsx`'s "Add to {Day}" / "Swap" buttons
reuse the existing `updateOpportunityStatusAction` (acted_on/dismissed) rather than inventing new
statuses; "acted_on" already writes `last_done_at`, the real signal that feeds future scoring, which
is the closest existing match to "commit to this for the weekend." The single-recommendation
weekend-plan system isn't removed — its Generate/Regenerate and Accept buttons are still on the page
(a small callout above the day sections), so nothing that worked before stopped working.

Other new pieces, all reusing pre-existing data: a weather banner (same NWS adapter/scoring as
Calendar's week-view strip) shown only when the forecast is bad enough to matter; custody state in
the header ("Kids with Richard Smith"), reusing the same custody-block query Calendar uses; a
"Dinners this week" strip reading real `meal_plans` rows (Module 7/household_layer, gated on that
flag same as everywhere else it appears) with a real recipe-title lookup, not placeholder data.
Right rail: the full pre-existing activity library (enjoyment/duration/locations/season/last-done,
mark-done/edit/deactivate all intact) plus each activity's "live score" — the real opportunity score
for that activity this week if one was detected, else an honest "not scored" rather than a fake
number — followed by the pre-existing activity-type settings (viability configs, gear checklists)
and Trip Ideas section, both relocated into the rail, not dropped.

**Scope simplification, logged not treated as an RQ:** Part 2's "Empty slots are dashed and offer
the two next-best options inline" isn't built — when a day has no opportunity clearing the existing
`STANDOUT_MIN_SCORE` threshold, this shows a plain empty state rather than surfacing below-threshold
candidates as fake "next-best" options, since the presentation layer (`getPresentedOpportunities`)
deliberately doesn't expose a below-threshold ranking today. Real, not fabricated, and this weekend's
real data (nothing detected yet for Sat/Sun) confirms the empty-state path renders correctly.

**Verified:** typecheck/lint/test(854/859, pre-existing)/build all clean. **Live-verified** at
1440px against real household data: the weekend header shows the real custody state, the activity
library shows all six real activities with real locations/last-done dates, the dinners strip shows
real "0 of 7 planned," and the empty-state proposal cards render correctly for both days (no
opportunities currently stand out this week in the real account — an honest result, not a bug).
Did not get to live-verify a populated `PlanProposalCard` (score numeral + chips) against a live
scored opportunity, since none exists in the account this week — worth a follow-up check once a
real opportunity is detected.

## Current step

Step 8 (Part 9) — Gifts. Target: replace the chronological idea feed with groups by person/
occasion, a 90-day timeline, order-by dates and budget bars per group, matching the reference image.
