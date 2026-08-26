"use server";

import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/db/client-server";
import { RESET_FLOW_COOKIE } from "@/lib/constants";

// Vercel's proxy sets these; localhost dev has no x-forwarded-* headers at
// all, so falls back to plain http on whatever host was requested. Used to
// build the absolute redirect URL Supabase needs for the password-reset
// email link, the same way a Route Handler gets `origin` for free from
// `new URL(request.url)` — Server Actions have no request object, so this
// is the equivalent for that context.
async function getSiteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export interface AuthActionState {
  error: string | null;
}

export async function signInWithPassword(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  redirect("/");
}

export async function signUpWithPassword(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) return { error: error.message };

  redirect("/onboarding");
}

export async function sendMagicLink(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) return { error: error.message };

  return { error: null };
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// Forgot-password flow, part 1 of 2 (Phase 3 backlog). Always returns the
// same success message regardless of whether the email matches an account
// — Supabase's own behavior, and correct: confirming account existence to
// an anonymous caller is an enumeration leak.
export async function sendPasswordResetEmail(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "");
  const origin = await getSiteOrigin();

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });
  // Supabase's own rate limiting on this endpoint surfaces as an error
  // here too (e.g. requesting twice in quick succession) — that's a real
  // error worth showing, unlike "no account with that email" which
  // Supabase itself doesn't distinguish from success.
  if (error) return { error: error.message };

  return { error: null };
}

// Forgot-password flow, part 2 of 2. Requires the caller to already hold
// the short-lived recovery session that /auth/callback establishes after
// exchanging the emailed link's code — there is no separate "current
// password" check because reaching this action at all already proves
// control of the account's email inbox.
//
// D-044: getUser() returning a user is NOT enough on its own — that's
// true of any normal logged-in session, not just one freshly created
// from a clicked reset-password link. Visiting /reset-password while
// already logged in used to silently change the real password with no
// error at all. RESET_FLOW_COOKIE (set only by app/auth/callback/route.ts
// when next=/reset-password) proves this session actually just came
// through that link; it's short-lived and cleared here on first use so it
// can't be replayed for a second password change later in the same login.
export async function updatePasswordAfterReset(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const password = String(formData.get("password") ?? "");

  const cookieStore = await cookies();
  const hasResetFlowCookie = cookieStore.get(RESET_FLOW_COOKIE) != null;
  cookieStore.delete(RESET_FLOW_COOKIE);
  if (!hasResetFlowCookie) {
    return { error: "That reset link has expired. Request a new one from the sign-in page." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "That reset link has expired. Request a new one from the sign-in page." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  redirect("/calendar");
}
