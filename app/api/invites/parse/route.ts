// POST /api/invites/parse -- reads a photo/screenshot of an invitation and
// returns what it found. Writes nothing; the confirm step is a server action
// (app/(app)/calendar/invite/actions.ts) the person triggers after reviewing.
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHouseholdContext } from "@/lib/auth/session";
import { AiBudgetExceededError, AiUnavailableError, isAiConfigured } from "@/lib/ai/client";
import { parseInviteImage } from "@/lib/invites/parse";

const bodySchema = z.object({
  base64Data: z.string().min(100),
  mediaType: z.enum(["image/png", "image/jpeg", "image/webp"]),
});

// ~3.5MB of base64 keeps us under Vercel's 4.5MB request limit; the client
// downsizes photos well below this before sending.
const MAX_BASE64_CHARS = 3_500_000;

export async function POST(request: Request) {
  const { supabase, household, timezone } = await requireHouseholdContext();

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid request." }, { status: 400 });
  }
  const body = bodySchema.safeParse(raw);
  if (!body.success) {
    return NextResponse.json({ status: "error", message: "That doesn't look like a photo — try again." }, { status: 400 });
  }
  if (body.data.base64Data.length > MAX_BASE64_CHARS) {
    return NextResponse.json({ status: "error", message: "That photo is too large — try a smaller one." }, { status: 413 });
  }
  if (!isAiConfigured()) {
    return NextResponse.json({ status: "unavailable", message: "Reading invitations is temporarily unavailable. Try again in a few minutes." });
  }

  try {
    const invite = await parseInviteImage(supabase, household.id, body.data.base64Data, body.data.mediaType, timezone);
    return NextResponse.json({ status: "ok", invite });
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      return NextResponse.json({ status: "unavailable", message: "Reading invitations is temporarily unavailable. Try again in a few minutes." });
    }
    if (error instanceof AiBudgetExceededError) {
      return NextResponse.json({ status: "unavailable", message: "Today's AI budget for this household has been reached — try again tomorrow." });
    }
    console.error("Invite parse failed:", error);
    return NextResponse.json({
      status: "error",
      message: "Couldn't read that invitation — try a clearer, straight-on photo with the whole card in view.",
    });
  }
}
