// Magic-link / email-confirmation / password-reset callback. Supabase
// redirects here with a `code` query param; exchanging it sets the session
// cookie via the server client. Where we send the user next depends on
// which flow they came from: password reset needs to land on
// /reset-password to actually set a new password, everything else (magic
// link, signup confirmation) goes to onboarding as before, which itself
// redirects to the app shell if they already have a household. The
// forgot-password action sets `next=/reset-password` on the email link's
// redirectTo (see app/actions.ts sendPasswordResetEmail) — anything else
// falls back to /onboarding, so this stays backward compatible with the
// magic-link/signup links already out in the wild with no `next` param.
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/client-server";
import { RESET_FLOW_COOKIE, RESET_FLOW_COOKIE_MAX_AGE_SECONDS } from "@/lib/constants";

const ALLOWED_NEXT_PATHS = new Set(["/onboarding", "/reset-password"]);

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const requestedNext = searchParams.get("next");
  const next = requestedNext && ALLOWED_NEXT_PATHS.has(requestedNext) ? requestedNext : "/onboarding";

  // Password-reset emails link here with a token_hash (see the "Reset
  // Password" email template in Supabase). Unlike the PKCE `code` flow below,
  // verifying a token hash needs nothing stored in the browser that asked for
  // the reset, so the link works from any device or browser, including the
  // phone's Safari when the reset was requested on a computer or in the app.
  if (tokenHash && type === "recovery") {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
    if (error) return NextResponse.redirect(`${origin}/forgot-password?linkProblem=1`);
    const response = NextResponse.redirect(`${origin}/reset-password`);
    response.cookies.set(RESET_FLOW_COOKIE, "1", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: RESET_FLOW_COOKIE_MAX_AGE_SECONDS,
      path: "/",
    });
    return response;
  }

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    // The emailed link was opened somewhere other than where it was
    // requested (typically the phone's browser instead of the iOS app, which
    // keeps its own separate session), or it expired. Say so instead of
    // landing on a page that can't work.
    if (error && next === "/reset-password") {
      return NextResponse.redirect(`${origin}/forgot-password?linkProblem=1`);
    }
  }

  const response = NextResponse.redirect(`${origin}${next}`);

  // D-044: mark that this session's authentication just came from a
  // clicked password-reset link, so updatePasswordAfterReset can tell that
  // apart from "any already-logged-in session" (which must NOT be allowed
  // to silently change the password via a direct /reset-password visit).
  // Short-lived and single-use — cleared by the action on first use.
  if (next === "/reset-password") {
    response.cookies.set(RESET_FLOW_COOKIE, "1", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: RESET_FLOW_COOKIE_MAX_AGE_SECONDS,
      path: "/",
    });
  }

  return response;
}
