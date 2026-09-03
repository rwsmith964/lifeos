// D-148: deterministic stand-in for real Anthropic calls, used ONLY by
// Playwright E2E specs (supabase/tests/pglite unit tests already fake AI
// at the callAi() call site directly — see lib/gifts/suggest.test.ts style
// tests — and don't need this). E2E runs against a real Next.js server, so
// there's no test-runner call boundary to intercept; the swap has to
// happen inside lib/ai/client.ts itself, gated by an env var that is never
// set in dev or production.
//
// Why fake the model instead of a real (low-cost) Anthropic test key: a
// real key makes the CI job flaky (network, rate limits, provider
// incidents) and non-deterministic (the review-UI round-trip spec needs
// EXACT field values to assert against). It also can't test nickname
// resolution deterministically -- see below.
//
// Enabled only when AI_TEST_MODE=1 (set in the e2e CI job only, see
// .github/workflows/verify.yml). isAiConfigured() is untouched -- CI sets
// a placeholder ANTHROPIC_API_KEY (never dialed) so that check still
// passes the normal way.
import type { AiCallParams } from "./client";

export function isAiTestFixtureModeEnabled(): boolean {
  return process.env.AI_TEST_MODE === "1";
}

interface FixtureResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

// Matches the "- <uuid> — <label> — <relationshipType>" roster lines
// buildBrainDumpUserPrompt() (lib/ai/prompts/brain-dump.ts) writes, and the
// CHILD_N token buildChildTokenMap() (lib/ai/context.ts) assigns per child.
// Real household people are typed as random gen_random_uuid()s in
// production, but this matches any UUID shape found in the fixture roster.
const ROSTER_LINE = /^- ([0-9a-fA-F-]{36}) — (\S+) — \S+$/m;

/**
 * Brain Dump / Quick Capture fixture (feature "brain_dump" | "quick_capture"
 * both route through the same prompt/schema per app/api/capture/route.ts's
 * P1-14/D-078 unification).
 *
 * If a CHILD_N token appears in the transcript (i.e. the app already
 * redacted a real child mention via lib/ai/context.ts's redactMentions()),
 * this returns a single add_interest item pinned to that child's real id --
 * faking only the "model reads the roster and resolves the token" step
 * while still exercising the app's own nickname -> token -> id pipeline for
 * real (spec 4, nickname resolution). If no CHILD_N token is present, it
 * returns a fixed two-item response (a calendar event + time off) that
 * needs no person resolution at all, used by the Brain Dump round-trip spec
 * (spec 2) — deliberately unrelated items, per the transcript that spec
 * submits, so the review UI's "every field visible before save" bug has
 * something to catch.
 */
function buildBrainDumpFixtureJson(userPrompt: string): string {
  const rosterSection = userPrompt.split("Transcript:")[0] ?? "";
  const transcriptSection = userPrompt.split("Transcript:")[1] ?? "";
  const childTokenMatch = transcriptSection.match(/CHILD_\d+/);

  if (childTokenMatch) {
    const token = childTokenMatch[0];
    const rosterLines = rosterSection.split("\n");
    const rosterLine = rosterLines.find((line) => line.includes(`— ${token} —`));
    const idMatch = rosterLine?.match(ROSTER_LINE);
    const personId = idMatch ? idMatch[1] : null;

    return JSON.stringify({
      items: [
        {
          type: "add_interest",
          summary: `Add 'rock climbing' to ${token}'s interests`,
          personId,
          personName: null,
          personRelationshipTypeGuess: null,
          personNotes: null,
          activityType: null,
          activityNotes: null,
          interest: "rock climbing",
          interestStrength: "regular",
          interactionType: null,
          interactionNotes: null,
          giftDescription: null,
          giftOccasionType: null,
          giftOccasionDate: null,
          giftCostDollars: null,
          eventTitle: null,
          eventStartsAtISO: null,
          eventEndsAtISO: null,
          eventAllDay: null,
          eventDateApproximate: null,
          eventType: null,
          noteText: null,
          budgetOccasionType: null,
          budgetMinDollars: null,
          budgetMaxDollars: null,
          timeOffStartDate: null,
          timeOffEndDate: null,
          timeOffReason: null,
          timeOffDestination: null,
        },
      ],
    });
  }

  return JSON.stringify({
    items: [
      {
        type: "create_calendar_event",
        summary: "Add dentist follow-up to the calendar",
        personId: null,
        personName: null,
        personRelationshipTypeGuess: null,
        personNotes: null,
        activityType: null,
        activityNotes: null,
        interest: null,
        interestStrength: null,
        interactionType: null,
        interactionNotes: null,
        giftDescription: null,
        giftOccasionType: null,
        giftOccasionDate: null,
        giftCostDollars: null,
        eventTitle: "E2E Fixture Dentist Follow-up",
        eventStartsAtISO: `${FIXTURE_EVENT_DATE}T15:00:00`,
        eventEndsAtISO: `${FIXTURE_EVENT_DATE}T15:30:00`,
        eventAllDay: false,
        eventDateApproximate: false,
        eventType: "personal",
        noteText: null,
        budgetOccasionType: null,
        budgetMinDollars: null,
        budgetMaxDollars: null,
        timeOffStartDate: null,
        timeOffEndDate: null,
        timeOffReason: null,
        timeOffDestination: null,
      },
      {
        type: "add_time_off",
        summary: "Add time off for the Seattle trip",
        personId: null,
        personName: null,
        personRelationshipTypeGuess: null,
        personNotes: null,
        activityType: null,
        activityNotes: null,
        interest: null,
        interestStrength: null,
        interactionType: null,
        interactionNotes: null,
        giftDescription: null,
        giftOccasionType: null,
        giftOccasionDate: null,
        giftCostDollars: null,
        eventTitle: null,
        eventStartsAtISO: null,
        eventEndsAtISO: null,
        eventAllDay: null,
        eventDateApproximate: null,
        eventType: null,
        noteText: null,
        budgetOccasionType: null,
        budgetMinDollars: null,
        budgetMaxDollars: null,
        timeOffStartDate: FIXTURE_TIME_OFF_START,
        timeOffEndDate: FIXTURE_TIME_OFF_END,
        timeOffReason: "Trip",
        timeOffDestination: "Seattle",
      },
    ],
  });
}

// Fixed relative-to-today dates so the E2E spec can assert exact values
// without racing "today" between when the spec was written and when it
// runs. Computed at require-time (module load), same day the test runs.
function isoDatePlusDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const FIXTURE_EVENT_DATE = isoDatePlusDays(4);
export const FIXTURE_TIME_OFF_START = isoDatePlusDays(14);
export const FIXTURE_TIME_OFF_END = isoDatePlusDays(16);

/**
 * Gift suggestion fixture (feature "gift_suggestion", lib/gifts/suggest.ts).
 * Three distinct categories with distinct shipping-window lead times
 * (supabase/migrations/20260820000013_gift_shipping_windows.sql) so that,
 * combined with a caller-chosen occasionDate, spec 5 (no deadline in the
 * past) gets one past-due and two future order-by dates from a single
 * generation call deterministically -- see e2e/gift-flow.spec.ts for the
 * exact date math.
 */
function buildGiftSuggestionFixtureJson(): string {
  return JSON.stringify([
    {
      title: "Fixture Gift Alpha",
      reasoning: "E2E fixture suggestion — furniture category has the longest shipping window, for order-by date math.",
      priceTier: "high",
      estimatedCostCents: 6500,
      category: "furniture",
    },
    {
      title: "Fixture Gift Beta",
      reasoning: "E2E fixture suggestion — standard category, mid shipping window.",
      priceTier: "mid",
      estimatedCostCents: 5500,
      category: "standard",
    },
    {
      title: "Fixture Gift Gamma",
      reasoning: "E2E fixture suggestion — digital category, no shipping window.",
      priceTier: "low",
      estimatedCostCents: 4500,
      category: "digital",
    },
  ]);
}

export function buildAiTestFixtureResponse(params: AiCallParams): FixtureResult {
  let text: string;
  switch (params.feature) {
    case "brain_dump":
    case "quick_capture":
      text = buildBrainDumpFixtureJson(params.userPrompt);
      break;
    case "gift_suggestion":
      text = buildGiftSuggestionFixtureJson();
      break;
    default:
      throw new Error(
        `AI_TEST_MODE has no fixture for feature "${params.feature}" — add one to lib/ai/test-fixtures.ts before writing an E2E spec that exercises it.`
      );
  }
  // Token counts are fake but non-zero and roughly proportional, so
  // ai_usage_log rows and estimateCostCents() still produce plausible
  // (non-NaN, non-negative) numbers for anything that reads them.
  return { text, inputTokens: 200, outputTokens: Math.max(50, Math.round(text.length / 4)) };
}
