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

## Current step

Step 2 (Part 9) — rebuild the primitives: button, tag, card, rail card, input, table row,
segmented control, avatar, empty state, skeleton. Starting now.
