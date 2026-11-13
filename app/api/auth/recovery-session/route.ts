// POST /api/auth/recovery-session -- finishes a password-reset link opened on
// any device. The emailed link (sent by sendPasswordResetEmail with the
// "implicit" flow) lands on /reset-password with the recovery tokens in the URL
// fragment, which only the browser can read; the page posts them here so the
// server can set the session cookies and mark this session as one that just
// came through a reset link (RESET_FLOW_COOKIE, see D-044).
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/db/client-server";
import { RESET_FLOW_COOKIE, RESET_FLOW_COOKIE_MAX_AGE_SECONDS } from "@/lib/constants";

const bodySchema = z.object({
  accessToken: z.string().min(20),
  refreshToken: z.string().min(1),
});

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const body = bodySchema.safeParse(raw);
  if (!body.success) return NextResponse.json({ ok: false }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  // setSession validates the tokens with Supabase; forged or expired ones fail.
  const { data, error } = await supabase.auth.setSession({
    access_token: body.data.accessToken,
    refresh_token: body.data.refreshToken,
  });
  if (error || !data.user) return NextResponse.json({ ok: false }, { status: 401 });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(RESET_FLOW_COOKIE, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: RESET_FLOW_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
  return response;
}
