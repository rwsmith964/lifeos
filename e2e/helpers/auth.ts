import type { Page } from "@playwright/test";

// Credentials for the two seeded E2E households — see supabase/seed.sql
// (Smith Household, the everyday dev/test household) and
// supabase/seed-e2e.sql (Jones Household, added solely for the
// cross-household isolation spec, D-148).
export const SMITH_CREDENTIALS = { email: "richard@example.com", password: "lifeos-dev-password" };
export const JONES_CREDENTIALS = { email: "jones-e2e@example.com", password: "lifeos-e2e-password" };

/**
 * Signs in via the password form on /login (app/login/page.tsx: #email,
 * #password, "Sign in" submit button) and waits for the post-login
 * redirect away from /login before returning.
 */
export async function signIn(page: Page, credentials: { email: string; password: string }): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(credentials.email);
  await page.locator("#password").fill(credentials.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}
