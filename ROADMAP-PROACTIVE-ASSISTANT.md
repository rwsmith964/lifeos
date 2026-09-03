# Roadmap: Proactive Assistant Vision (unbuilt, scoped for future sessions)

This document captures the larger vision Richard described in one message (see DECISIONS.md
D-135/D-136/D-137 for what was actually shipped toward it this session) as a set of scoped,
numbered candidates for future work. Nothing in this file has been built. Each item lists what it
needs, what it depends on, a rough size, and the related QUEUE-0XX entry in QUESTIONS.md where the
scoping tradeoff was first identified. Future sessions should assign real D-1XX numbers in
DECISIONS.md as each is actually built, not reuse the placeholder numbers below.

## Already shipped toward this vision (context, not roadmap)

- **D-135** — weekend planner recognizes household travel and stops recommending local activities
  during it; surfaces a trip-prep nudge instead. Added a `destination` field to time-off entries.
- **D-136** — Universal Intake (Module 3) got a real UI: paste text or upload a photo/screenshot,
  review AI-extracted drafts, approve or reject into a real record (calendar event, gift idea,
  person note, etc).
- **D-137** — person profiles show demographic-based interest suggestion bubbles (age + relationship
  type → curated popular interests, one click to add).

These three are the foundation the items below build on — travel awareness, a working intake
pipeline for screenshots, and richer person profiles.

---

## R-1: Itinerary-aware trip planning (TSA cutoff → drive time → childcare → packing)

**What Richard described:** upload a flight screenshot; the tool should recognize the flight time,
work backward through a TSA/airport arrival cutoff, compute drive time to the airport from wherever
the traveler currently is, check whether the kids have an *accepted* childcare request and who/where
they'll be, and schedule drive time, drop-off time, and packing time — essentially building the
whole pre-trip schedule automatically.

**Why it's not built yet:** this needs actual itinerary data to reason over, which doesn't exist in
the data model. D-136's intake UI is the entry point (a flight screenshot becomes an intake draft),
but `lib/intake/convert.ts` currently only knows how to convert a draft into a `calendar_event`,
`gift_idea`, `person_note`, `person`, `moment`, or `recipe` — there's no `travel_itinerary` or
`flight` record type, and no logic that chains one event (a flight) into a cascade of derived events
(pack, drive, drop off kids, arrive at airport).

**Rough shape of the work:**
1. New record type in the intake pipeline (`flight` or `travel_leg`) with structured fields
   (departure airport, departure time, arrival time/airport) — extend `lib/intake/prompts.ts` and
   `lib/intake/confidence.ts`'s field schema for this type.
2. A small "airport profile" concept: typical TSA buffer (configurable, default e.g. 2 hours
   domestic) and a way to estimate drive time to the airport — likely reusing whatever geocoding/
   drive-time approach `lib/external/geocode.ts` and the existing travel-time scoring in
   `lib/planner/travel-score.ts` already use, rather than a new integration.
3. A cascade builder: given a flight record + household context, generate draft calendar events
   for "pack," "leave for airport," "arrive by TSA cutoff" — as **drafts**, not silent auto-writes,
   per the Additive Contract's "drafts not writes where relevant" rule. The existing Execution
   module's draft-review pattern (`app/(app)/execution/`) is the closest precedent for a
   generate-then-approve flow.
4. Childcare cross-reference: query `childcare_requests` for accepted requests overlapping the
   travel window, surface who's covering the kids and where, in the same trip-prep nudge D-135
   introduced (`buildTravelingPlanMarkdown`).

**Size:** Large — this is the single biggest item in the original vision. Depends on R-2 existing
first (or being built alongside it) for the "what kind of trip is this" context that shapes the
cascade.

## R-2: Packing checklist wizard

**What Richard described:** a feature that asks what type of trip and what activities are planned,
then formulates a packing list from that — not a single static template.

**Why it's not built yet:** `lib/planner/gear-checklist.ts` already exists and is tested
(`gear-checklist.test.ts`) but only covers gear for a specific *local activity* (e.g. "bring a rod
and waders for fishing"), not a multi-day trip packing list. There's no trip-type taxonomy or
question flow anywhere in the app.

**Rough shape of the work:**
1. A short wizard (trip type: beach / city / camping / ski / visiting family / other; duration;
   who's going; planned activities — could reuse `child_activities`/`trip_ideas` if the trip has
   linked activities already) that produces a checklist, likely via an AI prompt similar in shape
   to `lib/ai/prompts/gift-suggestion.ts` (structured JSON out, given structured trip context in).
2. A packing-list storage shape — probably a new lightweight table (e.g. `packing_lists` +
   `packing_list_items` with a `checked` boolean) rather than overloading `child_activities` or
   `trip_ideas`, since a packing list is a checklist, not a scheduled event.
3. UI: a checklist view with add/remove/check-off, reachable from wherever a trip lives (the
   time-off entry, once R-1's itinerary concept exists, or standalone from the trip-prep nudge
   D-135 added).

**Size:** Medium. Doesn't strictly depend on R-1 — could ship as a standalone "build a packing
list for a trip" tool before the full itinerary cascade exists, using the time-off entry's
destination/dates as the trip context.

## R-3: Structured onboarding questionnaire for new users

**What Richard described:** when a person signs up, a detailed onboarding process should help
organize their information before the tool starts building out ideas — rather than starting from
an empty household and hoping the user thinks to fill everything in.

**Why it's not built yet:** `/onboarding` exists today but (per FEATURES.md's original inventory)
is a light first-run flow, not the detailed questionnaire described. This is a product-design task
as much as an engineering one — the question set itself (household composition, each person's
basics, work schedules, recurring commitments, key relationships to track) needs to be defined
before it's built.

**Rough shape of the work:**
1. Define the question set and its structure (likely a multi-step wizard, one screen per
   household member, mirroring the granularity `people`, `work_schedules`, and
   `person_interests` already support).
2. Wizard UI writing through the *existing* repository functions (`peopleRepo`,
   `workSchedulesRepo`, `personInterestsRepo`, etc.) — no new tables needed, this is a UI/flow
   problem, not a data-model problem for the most part.
3. Ties in naturally with R-6 below (demographic suggestion bubbles, already shipped in D-137,
   are a good building block for "who is this person and what do they like" onboarding screens).

**Size:** Medium-large, mostly UX/content design work rather than novel backend.

## R-4: Per-profile review flow after a brain dump

**What Richard described:** after a brain dump that mentions several people, activities, etc.,
the tool should open each newly-created person's profile one at a time so the user can correct
and fill in gaps before saving — same idea for activities.

**Why it's not built yet:** the brain-dump flow (`/brain-dump`, `lib/ai/prompts/brain-dump.ts`)
already extracts multiple entities from free text and creates records, but there's no post-creation
review step — records save immediately with whatever the AI extracted.

**Rough shape of the work:**
1. After a brain dump completes, instead of navigating straight back to wherever the user was,
   route through a short sequence of "confirm this person" / "confirm this activity" screens —
   essentially the same review-and-correct pattern D-136's intake review queue introduced, but as
   a *guided sequence* (one at a time, "next" flow) rather than a persistent queue.
2. D-136 built the underlying pieces this needs: `lib/intake/labels.ts` for human-readable field
   display, and the approve/correct/reject pattern in `lib/intake/review-queue.ts` — but the
   brain-dump flow writes directly rather than going through `intake_drafts` first. Whether to
   route brain-dump through the intake pipeline (so this review flow is free) or build a separate
   review sequence specific to brain-dump output is the key design decision for whoever picks this
   up (see QUEUE-039 for the related "no inline correction UI yet" gap in D-136's queue that this
   would also need to solve).

**Size:** Medium. Most of the underlying primitives (draft review, field labels, correction UX)
already exist from D-136 — the work here is mostly about brain-dump specifically routing through
that pattern instead of writing directly, plus building the "one profile at a time" sequencing UI.

## R-5: In-app feature-flag management

**Not from Richard's original message, but surfaced as a real gap this session (QUEUE-039):** all
eight module feature flags (`ambient_display`, `brief_registration_v2`, `execution_draft_only`,
`household_layer`, `universal_intake_v2`, `leisure_planner_v2`, `relationship_gift_engine_v2`,
`scheduling_v2`) have been toggled exclusively via direct SQL across every session to date — there
is no Settings-page UI for a household owner to turn a shipped-but-flagged feature on or off. Worth
a small Settings panel once enough of these modules are considered stable enough to expose the
toggle to Richard directly instead of an agent doing it via SQL.

**Size:** Small.

## R-6: Gender field for people (only if a real need emerges)

**From QUEUE-040:** Richard's message mentioned "age, gender, general demographics" but the schema
has no gender field, and D-137's suggestion bubbles were deliberately built non-gendered rather
than guessing at what stereotypical splitting would look like. Only worth adding if a concrete
downstream feature actually needs it — adding a nullable column is cheap, but it touches the
in-progress App Store / Play Store privacy disclosures (see the launch-prep workstream), so it's
listed here as a decision to make deliberately, not a default to reach for.

**Size:** Small schema change, but non-trivial privacy/disclosure follow-up.

---

## Suggested build order

R-2 (packing wizard) and R-5 (flag UI) are the cheapest, most self-contained wins and don't block
on anything else. R-4 (brain-dump review flow) is next — it reuses D-136's review-queue primitives
directly. R-3 (onboarding questionnaire) is a content-design-heavy parallel track. R-1 (the full
itinerary/TSA/childcare cascade) is the largest and most valuable piece of the original ask, but
depends on decisions from R-2 (trip-type context) and benefits from R-4/R-3 existing first (richer,
more complete person and household data to reason over). R-6 (gender field) should wait for a
concrete need rather than being built speculatively.
