// Product naming is undecided (Section 12.1 / QUESTIONS.md Q-001) — every
// piece of UI copy references this constant instead of a hardcoded string,
// so renaming the product is a one-line change.
export const APP_NAME = "LifeOS";

// Short-lived marker cookie proving the current session was actually just
// established via a clicked password-reset email link, not merely "any
// authenticated session" (D-044: /reset-password previously let any
// logged-in user silently change their own password with no error, since
// its only check was supabase.auth.getUser() returning a user at all —
// true for a normal login session too). Set by app/auth/callback/route.ts
// only when next=/reset-password, read and single-use-cleared by
// updatePasswordAfterReset in app/actions.ts.
export const RESET_FLOW_COOKIE = "lifeos_reset_flow";
export const RESET_FLOW_COOKIE_MAX_AGE_SECONDS = 15 * 60;
