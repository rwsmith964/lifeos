# Roadmap: Proactive Assistant Vision

This document originally captured the larger vision Richard described in one message as a set of
scoped, numbered candidates for future work (R-1 through R-6). **As of D-152, R-1 through R-5 have
all shipped** — see the DECISIONS.md entries linked below for what was actually built, including
any scope reductions from the original plan. Only R-6 remains open, and it's explicitly
"build only if a real need emerges," not a default to reach for.

## Status summary

| Item | Status | Shipped as |
| --- | --- | --- |
| R-1: Itinerary-aware trip planning (TSA cutoff → drive time → childcare → packing) | **Shipped** | D-142 |
| R-2: Packing checklist wizard | **Shipped** | D-139 |
| R-3: Structured onboarding questionnaire | **Shipped** | D-141 (extended by D-152: home address step) |
| R-4: Per-profile review flow after a brain dump | **Shipped** | D-140 |
| R-5: In-app feature-flag management | **Shipped** | D-138 |
| R-6: Gender field for people | Open — only if a real need emerges | — |

## Already shipped toward this vision

- **D-135** — weekend planner recognizes household travel and stops recommending local activities
  during it; surfaces a trip-prep nudge instead. Added a `destination` field to time-off entries.
- **D-136** — Universal Intake (Module 3) got a real UI: paste text or upload a photo/screenshot,
  review AI-extracted drafts, approve or reject into a real record (calendar event, gift idea,
  person note, etc).
- **D-137** — person profiles show demographic-based interest suggestion bubbles (age + relationship
  type → curated popular interests, one click to add).
- **D-138 (R-5)** — Settings > Modules gives household owners a toggle panel for all eight feature
  flags, replacing the direct-SQL-only toggle path used in every prior session.
- **D-139 (R-2)** — a packing checklist wizard: trip type/duration/who's going/planned activities in,
  an AI-generated checklist out, stored in new `packing_lists`/`packing_list_items` tables with a
  checklist UI (add/remove/check off).
- **D-140 (R-4)** — after a brain dump extracts multiple people/activities, a guided one-at-a-time
  review sequence lets the user confirm or correct each new record before it's finalized, reusing
  D-136's intake review-queue primitives.
- **D-141 (R-3)** — `/onboarding` is now a multi-step wizard: household + self, then add other
  members, then one screen per person for work schedule/recurring activities/interests, then a
  summary. D-152 (this pass) added a skippable home-address step to this same wizard.
- **D-142 (R-1)** — flight/boarding-pass intake now recognizes a `flight` record type and computes
  a TSA-cutoff → drive-time → pack-by cascade (`lib/intake/trip-cascade.ts`), plus cross-references
  accepted childcare coverage for the trip window. Shipped as a smaller surface than the original
  plan (folded into the existing generic intake prompt rather than a dedicated parser) — see D-142
  in DECISIONS.md for why.

These are the foundation for the one remaining item below — travel awareness, a working intake
pipeline for screenshots, richer person profiles, and now a working trip-planning cascade, packing
wizard, brain-dump review flow, in-app flag management, and a more complete onboarding flow are all
live in the app, not just designed.

---

## R-6: Gender field for people (only if a real need emerges)

**From QUEUE-040:** Richard's message mentioned "age, gender, general demographics" but the schema
has no gender field, and D-137's suggestion bubbles were deliberately built non-gendered rather
than guessing at what stereotypical splitting would look like. Only worth adding if a concrete
downstream feature actually needs it — adding a nullable column is cheap, but it touches the
in-progress App Store / Play Store privacy disclosures (see the launch-prep workstream), so it's
listed here as a decision to make deliberately, not a default to reach for.

**Size:** Small schema change, but non-trivial privacy/disclosure follow-up.

**Status:** Open. Not built. No concrete downstream feature has needed it yet as of D-152.
