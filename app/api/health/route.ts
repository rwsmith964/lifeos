// GET /api/health — reports feature availability, not secrets. The three
// AI buttons (gift ideas, weekend plan, Quick Capture) call this once per
// page load to decide whether to render enabled or disabled-with-tooltip,
// instead of letting the user submit into a guaranteed failure. No auth
// required — this reveals nothing sensitive, just booleans.
import { NextResponse } from "next/server";
import { isAiConfigured } from "@/lib/ai/client";

export async function GET() {
  return NextResponse.json({ ai: isAiConfigured() });
}
