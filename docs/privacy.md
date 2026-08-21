# Privacy — minors' data (Section 6.5)

Any table containing a person with `relationship_type = 'child'` — particularly
`custody_blocks` and `calendar_events` with location data — is sensitive.
This document is the single source of truth for how LifeOS handles it. Every
place in the codebase that touches child data links back here in a comment.

## Rules

1. **Never log location data.** No `console.log`, `console.error`, or
   third-party logging call may include `location`, `location_lat`,
   `location_lng`, or any `activity_locations` field for an event or block
   involving a `child`-relationship person. This applies in both directions:
   don't log the location itself, and don't log it keyed by a child's name.

2. **Never send a child's real name or location to the Anthropic API unless
   the feature genuinely requires it.** Where a feature (e.g. the daily
   brief) needs to reference a child's schedule but doesn't need to *identify*
   them to the model, substitute a token: `CHILD_1`, `CHILD_2`, stable per
   household for the lifetime of the prompt-building call. The mapping from
   token back to real person happens client-side, after the AI response comes
   back — never inside the prompt or the model's response.

   "Genuinely requires it" means: the feature's own correctness depends on
   the model seeing the real name (there isn't one in v1 — briefs, gift
   suggestions, and weekend narration all work fine with tokens for children;
   an adult's gift suggestions and interests DO use real names, since
   depersonalizing an adult recipient's own suggestion list serves no purpose
   and the recipient is the one asking).

3. **This is enforced in `lib/ai/context.ts`**, the single module responsible
   for assembling AI prompt context from database rows. Every AI feature
   (`lib/ai/prompts/*.ts`) must build its context through that module rather
   than querying `people`/`custody_blocks`/`calendar_events` directly and
   interpolating results into a prompt by hand. This keeps the
   token-substitution rule enforceable in one place instead of trusted to be
   remembered at every call site.

4. **RLS is the tenancy boundary, not the child-safety boundary.** A
   `child`-relationship person's row is still household-readable under RLS
   (see DECISIONS.md D-009) — access control across households is handled at
   the database layer, but the redaction rules above are an *application*
   layer concern on top of that, because "don't put this in a third-party AI
   prompt" isn't something a Postgres policy can express.

## Non-goals

This document does not cover: encryption at rest (Supabase/Postgres default),
transport security (HTTPS is assumed, not configured here), or GDPR/COPPA
compliance review — none of which are in scope for a single-user v1. If the
product moves toward the multi-tenant co-parenting future described in
Section 6.4, this document needs a real compliance pass before that ships,
not just a schema that supports it.
