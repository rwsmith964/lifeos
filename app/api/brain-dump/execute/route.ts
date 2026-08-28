// Brain-dump execute endpoint (D-066). The review UI calls this once per
// item the user approves (optionally after editing it) — never for items
// the user discarded. Reuses the exact same executeAction as Quick Capture
// (lib/ai/capture-actions.ts) so both features write identically.
import { NextResponse } from "next/server";
import { requireHouseholdContext } from "@/lib/auth/session";
import { executeAction, isKnownPersonId } from "@/lib/ai/capture-actions";
import { brainDumpItemSchema } from "@/lib/ai/prompts/brain-dump";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { friendlyMutationError } from "@/lib/db/errors";

interface BrainDumpExecuteRequestBody {
  item: unknown;
}

export async function POST(request: Request) {
  const { supabase, household, selfPerson } = await requireHouseholdContext();

  let body: BrainDumpExecuteRequestBody;
  try {
    body = (await request.json()) as BrainDumpExecuteRequestBody;
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid request body" }, { status: 400 });
  }

  // The item may have been edited client-side (person reassigned, date
  // fixed, description tweaked) before the user hit Save, so it's
  // re-validated here exactly like a fresh AI response would be — never
  // trust that an object shaped like a BrainDumpItem actually is one just
  // because it came back from a page that received one.
  const validated = brainDumpItemSchema.omit({ summary: true }).safeParse(body.item);
  if (!validated.success) {
    return NextResponse.json({ status: "error", message: "That item looks incomplete — check the fields and try again." });
  }
  const action = validated.data;

  const people = await listPeopleForHousehold(supabase, household.id);
  if (!isKnownPersonId(people, action.personId)) {
    return NextResponse.json({
      status: "error",
      message: "Something went wrong resolving who that's about — try naming them again.",
    });
  }

  try {
    await executeAction(supabase, household, selfPerson, action);
  } catch (error) {
    return NextResponse.json({
      status: "error",
      message: friendlyMutationError(error, { fallback: "Couldn't save that — please try again." }),
    });
  }

  return NextResponse.json({ status: "ready" });
}
