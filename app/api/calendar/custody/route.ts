// POST /api/calendar/custody — create a custody block. A Route Handler
// rather than a Server Action; see lib/hooks/use-form-post.ts and
// DECISIONS.md D-031.
import { NextResponse } from "next/server";
import { requireHouseholdContext } from "@/lib/auth/session";
import { custodyBlocksRepo } from "@/lib/db/repositories/calendar";
import { custodyBlockInsertSchema } from "@/lib/db/schemas";

export async function POST(request: Request) {
  const { supabase, household } = await requireHouseholdContext();
  const formData = await request.formData();

  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");

  if (endDate < startDate) {
    return NextResponse.json({ error: "End date can't be before the start date." }, { status: 400 });
  }

  const parsed = custodyBlockInsertSchema.safeParse({
    household_id: household.id,
    child_person_id: String(formData.get("childPersonId") ?? ""),
    responsible_person_id: String(formData.get("responsiblePersonId") ?? ""),
    starts_at: new Date(`${startDate}T17:00:00`).toISOString(),
    ends_at: new Date(`${endDate}T17:00:00`).toISOString(),
    block_type: String(formData.get("blockType") ?? "regular"),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  try {
    const block = await custodyBlocksRepo.create(supabase, parsed.data);
    return NextResponse.json({ id: block.id });
  } catch (error) {
    console.error("POST /api/calendar/custody failed:", error);
    return NextResponse.json({ error: "Couldn't save this custody block — please try again." }, { status: 500 });
  }
}
