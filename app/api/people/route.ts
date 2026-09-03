// POST /api/people — create a person. A Route Handler rather than a Server
// Action; see lib/hooks/use-form-post.ts and DECISIONS.md D-031.
import { NextResponse } from "next/server";
import { requireHouseholdContext } from "@/lib/auth/session";
import { getZonedNow } from "@/lib/timezones";
import { peopleRepo } from "@/lib/db/repositories/people";
import { personInsertSchema } from "@/lib/db/schemas";
import { friendlyMutationError } from "@/lib/db/errors";

export async function POST(request: Request) {
  const { supabase, household, timezone } = await requireHouseholdContext();
  const formData = await request.formData();

  const birthdate = String(formData.get("birthdate") ?? "");
  // D-143: household-local today, not a bare `new Date()` -- see
  // lib/timezones.ts's getZonedNow for why.
  if (birthdate && birthdate > getZonedNow(timezone).toISOString().slice(0, 10)) {
    return NextResponse.json({ error: "Birthdate can't be in the future." }, { status: 400 });
  }

  const parsed = personInsertSchema.safeParse({
    household_id: household.id,
    full_name: String(formData.get("fullName") ?? "").trim(),
    nickname: String(formData.get("nickname") ?? "").trim() || null,
    relationship_type: String(formData.get("relationshipType") ?? "friend"),
    birthdate: birthdate || null,
    birth_year_known: formData.get("birthYearKnown") === "on",
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  try {
    const person = await peopleRepo.create(supabase, parsed.data);
    return NextResponse.json({ id: person.id });
  } catch (error) {
    return NextResponse.json(
      { error: friendlyMutationError(error, { fallback: "Couldn't save this person — please try again." }) },
      { status: 500 }
    );
  }
}
