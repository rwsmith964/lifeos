// POST /api/calendar/custody/parse-agreement — D-075 (best-effort). Takes
// pasted custody-agreement text and asks the AI to map it onto the Weekly
// builder's day-by-day shape (see lib/ai/prompts/custody-agreement.ts for
// the full scope/limitations). Nothing is written to the database here —
// this only returns a proposed pattern for the client's review UI; the
// user must explicitly "Apply to builder" and then "Create schedule" for
// anything to actually be saved (the "verify before continuing" step the
// user asked for).
import { NextResponse } from "next/server";
import { requireHouseholdContext } from "@/lib/auth/session";
import { AiBudgetExceededError, AiUnavailableError, callAi, isAiConfigured } from "@/lib/ai/client";
import { parseAiJson } from "@/lib/ai/parse-json";
import {
  buildCustodyAgreementUserPrompt,
  custodyAgreementResponseSchema,
  CUSTODY_AGREEMENT_SYSTEM_PROMPT,
  type CustodyAgreementRosterPerson,
} from "@/lib/ai/prompts/custody-agreement";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { filterEligibleResponsibleAdults } from "@/lib/custody/eligible-parents";

const MAX_AGREEMENT_CHARS = 20000;

interface ParseAgreementRequestBody {
  text: string;
}

export async function POST(request: Request) {
  const { supabase, household } = await requireHouseholdContext();

  if (!isAiConfigured()) {
    return NextResponse.json({
      status: "unavailable",
      message: "Custody agreement parsing is temporarily unavailable. Try again in a few minutes, or build the schedule manually below.",
    });
  }

  let body: ParseAgreementRequestBody;
  try {
    body = (await request.json()) as ParseAgreementRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "Paste the text of the custody agreement first." }, { status: 400 });
  }
  const truncated = text.slice(0, MAX_AGREEMENT_CHARS);

  const people = await listPeopleForHousehold(supabase, household.id);
  // Only offer the AI the same "eligible responsible adult" set the Weekly
  // builder's own person picker uses (self/co_parent/spouse/partner) — a
  // live-verification run found the model matching "Mother"/"Father" against
  // a household member tagged relationship_type "parent" (meaning a
  // grandparent to the kids, per lib/custody/eligible-parents.ts), which the
  // builder then couldn't render at all (that id isn't a selectable option),
  // silently dropping 4 of 7 days. Narrowing the roster we hand the model to
  // exactly the eligible set makes every returned id guaranteed renderable,
  // and removes the ambiguous grandparent as a candidate the model could
  // mismatch onto in the first place.
  const eligibleAdults = filterEligibleResponsibleAdults(people);
  const eligibleIds = new Set(eligibleAdults.map((p) => p.id));
  const adults: CustodyAgreementRosterPerson[] = eligibleAdults.map((p) => ({
    id: p.id,
    label: p.nickname || p.full_name,
    relationshipType: p.relationship_type,
  }));
  const children: CustodyAgreementRosterPerson[] = people
    .filter((p) => p.relationship_type === "child")
    .map((p) => ({ id: p.id, label: p.nickname || p.full_name, relationshipType: p.relationship_type }));

  if (adults.length < 2) {
    return NextResponse.json({
      status: "unavailable",
      message: "You need at least two eligible adults (co-parent, spouse, or partner) on record before parsing a custody agreement — add one under People first.",
    });
  }

  if (children.length === 0) {
    return NextResponse.json({ error: "Add at least one child to the household before parsing a custody agreement." }, { status: 400 });
  }

  try {
    const result = await callAi(supabase, {
      householdId: household.id,
      feature: "custody_agreement_parse",
      systemPrompt: CUSTODY_AGREEMENT_SYSTEM_PROMPT,
      userPrompt: buildCustodyAgreementUserPrompt(truncated, adults, children),
      maxTokens: 1536,
    });

    const parsed = parseAiJson(result.text);
    if (!parsed.success) {
      return NextResponse.json({
        status: "unavailable",
        message: "Couldn't make sense of that agreement's format. Try pasting just the schedule/handover section, or build it manually below.",
      });
    }
    const validated = custodyAgreementResponseSchema.safeParse(parsed.data);
    if (!validated.success) {
      return NextResponse.json({
        status: "unavailable",
        message: "Couldn't make sense of that agreement's format. Try pasting just the schedule/handover section, or build it manually below.",
      });
    }

    // Defensive: only ids that are actually valid, eligible-responsible-adult
    // personIds in this household's own roster survive — the model resolves
    // names against the roster we gave it, but never trust an AI response's
    // ids as authorization-safe input straight into another call, and never
    // let through an id the Weekly builder's own dropdown couldn't render.
    const sanitizedAssignments: Record<string, string | null> = {};
    for (const [dayIndex, personId] of Object.entries(validated.data.weeklyAssignments)) {
      sanitizedAssignments[dayIndex] = personId && eligibleIds.has(personId) ? personId : null;
    }
    const validPersonIds = new Set(people.map((p) => p.id));
    const sanitizedChildIds = validated.data.childPersonIds.filter((id) => validPersonIds.has(id) && children.some((c) => c.id === id));

    return NextResponse.json({
      status: "ok",
      ...validated.data,
      weeklyAssignments: sanitizedAssignments,
      childPersonIds: sanitizedChildIds.length > 0 ? sanitizedChildIds : children.map((c) => c.id),
    });
  } catch (error) {
    if (error instanceof AiUnavailableError || error instanceof AiBudgetExceededError) {
      return NextResponse.json({
        status: "unavailable",
        message:
          error instanceof AiBudgetExceededError
            ? "Today's AI usage limit has been reached. Try again tomorrow, or build the schedule manually below."
            : "Custody agreement parsing is temporarily unavailable. Try again in a few minutes, or build the schedule manually below.",
      });
    }
    return NextResponse.json({
      status: "unavailable",
      message: "Something went wrong reading that agreement. Try again, or build the schedule manually below.",
    });
  }
}
