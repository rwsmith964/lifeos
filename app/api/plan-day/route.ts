// POST /api/plan-day -- one turn of the "plan my day" conversation. The client
// sends the whole conversation each time (nothing is stored server-side until
// the person confirms the plan).
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHouseholdContext } from "@/lib/auth/session";
import { isAiConfigured } from "@/lib/ai/client";
import { getZonedNow } from "@/lib/timezones";
import { runDayPlanTurn } from "@/lib/planning/day-plan-server";

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().trim().min(1).max(4000) }))
    .min(1)
    .max(40),
});

export async function POST(request: Request) {
  const { supabase, household, selfPerson, userId, timezone } = await requireHouseholdContext();

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid request." }, { status: 400 });
  }
  const body = bodySchema.safeParse(raw);
  if (!body.success || body.data.messages[body.data.messages.length - 1].role !== "user") {
    return NextResponse.json({ status: "error", message: "Say what you'd like to plan." }, { status: 400 });
  }
  if (!isAiConfigured()) {
    return NextResponse.json({ status: "unavailable", message: "Planning is temporarily unavailable. Try again in a few minutes." });
  }

  try {
    const result = await runDayPlanTurn(
      supabase,
      { householdId: household.id, selfPerson, userId, timezone, now: getZonedNow(timezone) },
      body.data.messages
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error("Day plan turn failed:", error);
    return NextResponse.json({ status: "error", message: "Something went wrong — try that again." });
  }
}
