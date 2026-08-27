/**
 * Validates a `next=` redirect target carried through login/signup (added
 * for the household-invite flow, so a not-yet-authenticated invitee lands
 * back on `/invite/[token]` after signing in/up instead of the default
 * home/onboarding route). Must be a same-site, path-only string — rejects
 * anything that could send the user off-site after auth (a classic open-
 * redirect vector): absolute URLs, protocol-relative `//evil.com` paths,
 * and anything not starting with a single `/`.
 *
 * Deliberately kept in its own module with no server-only imports (no
 * "next/headers", no DB clients) — it's used from client components
 * (app/login/page.tsx, app/signup/page.tsx) to decide whether to render
 * the hidden `next` field, not just from Server Actions.
 */
export function isSafeRedirectPath(path: string | null | undefined): path is string {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//") && !path.includes("://");
}
