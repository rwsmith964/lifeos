"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/db/client-server";
import { createSupabaseServiceRoleClient } from "@/lib/db/client-service-role";
import { RESET_FLOW_COOKIE } from "@/lib/constants";
import { getSiteOrigin } from "@/lib/http/site-origin";
import { isSafeRedirectPath } from "@/lib/http/safe-redirect";

export interface AuthActionState {
  error: string | null;
}

// D-108: Supabase Auth's own /auth/v1/token rate limit is IP-based only
// (1,800 req/hour, bursts of 30 -- see
// https://supabase.com/docs/guides/auth/rate-limits) with no documented
// per-account lockout, so an attacker rotating IPs (or just staying under
// that generic quota) could otherwise throw a large number of password
// guesses at one known email address. auth_login_attempts (service-role
// only, zero anon/authenticated grants -- see its migration) backs a
// simple per-email lockout: too many failures in the window blocks
// further attempts for that email without even calling Supabase, and a
// success clears the count. Deliberately per-email rather than per-IP: it
// directly protects any single targeted account regardless of how many
// source IPs the attacker uses, which is the classic account-takeover
// vector this closes.
const LOGIN_ATTEMPT_WINDOW_MINUTES = 15;
const LOGIN_ATTEMPT_MAX = 5;

function normalizeEmailKey(email: string): string {
  return email.trim().toLowerCase();
}

function attemptWindowStart(): string {
  return new Date(Date.now() - LOGIN_ATTEMPT_WINDOW_MINUTES * 60_000).toISOString();
}

async function isLoginLocked(emailKey: string): Promise<boolean> {
  const supabase = createSupabaseServiceRoleClient();
  const since = attemptWindowStart();
  // Prune this email's own stale rows first (indexed on email_key so this
  // stays cheap) rather than running a separate cleanup job -- keeps the
  // table bounded without adding a cron/DDL for what is otherwise a tiny
  // security-bookkeeping table.
  await supabase.from("auth_login_attempts").delete().eq("email_key", emailKey).lt("attempted_at", since);
  const { count } = await supabase
    .from("auth_login_attempts")
    .select("*", { count: "exact", head: true })
    .eq("email_key", emailKey)
    .gte("attempted_at", since);
  return (count ?? 0) >= LOGIN_ATTEMPT_MAX;
}

async function recordFailedLogin(emailKey: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  await supabase.from("auth_login_attempts").insert({ email_key: emailKey });
}

async function clearFailedLogins(emailKey: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  await supabase.from("auth_login_attempts").delete().eq("email_key", emailKey);
}

export async function signInWithPassword(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const emailKey = normalizeEmailKey(email);

  if (emailKey && (await isLoginLocked(emailKey))) {
    return {
      error: "Too many sign-in attempts for this account. Please wait a few minutes and try again.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (emailKey) await recordFailedLogin(emailKey);
    return { error: error.message };
  }
  if (emailKey) await clearFailedLogins(emailKey);

  // `next` is a hidden field the login form fills from its own `?next=`
  // query param (see app/login/page.tsx) — used by the household-invite
  // flow so a logged-out invitee ends up back on /invite/[token] instead
  // of the normal home page after signing in. isSafeRedirectPath guards
  // against this being turned into an open redirect via a crafted link.
  const next = formData.get("next");
  redirect(isSafeRedirectPath(next?.toString()) ? next!.toString() : "/");
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

  // A signup reached via an invite link (`?next=/invite/[token]`) must
  // NOT be funneled into the normal "create your own household" onboarding
  // — this person is joining an existing household, not starting one.
  // Route them back to the invite landing page instead, where the "logged
  // in with matching email" branch shows the accept button directly.
  // Anything else falls back to the normal onboarding path unchanged.
  const next = formData.get("next")?.toString();
  redirect(next && isSafeRedirectPath(next) && next.startsWith("/invite/") ? next : "/onboarding");
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
