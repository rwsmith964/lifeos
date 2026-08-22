// Magic-link / email-confirmation callback. Supabase redirects here with a
// `code` query param; exchanging it sets the session cookie via the server
// client, then we send the user on to onboarding (which redirects to the
// app shell if they already have a household).
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/db/client-server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}/onboarding`);
}
