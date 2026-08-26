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

const ALLOWED_NEXT_PATHS = new Set(["/onboarding", "/reset-password"]);

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next");
  const next = requestedNext && ALLOWED_NEXT_PATHS.has(requestedNext) ? requestedNext : "/onboarding";

  if (code) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
