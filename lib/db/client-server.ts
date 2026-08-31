import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

/**
 * Server Component / Route Handler client — reads the caller's session from
 * cookies, so every query through this client is subject to RLS as that
 * user. This is the client every repository function should receive by
 * default; only cron/admin code should reach for the service-role client.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            // D-113: @supabase/ssr's own DEFAULT_COOKIE_OPTIONS omits `secure`
            // entirely (sameSite: "lax", httpOnly: false, no secure flag at
            // all), so the session cookie ships without Secure in production
            // unless we force it here. Matches the same
            // `process.env.NODE_ENV === "production"` pattern
            // app/auth/callback/route.ts already uses for RESET_FLOW_COOKIE.
            cookieStore.set(name, value, {
              ...options,
              secure: process.env.NODE_ENV === "production",
            });
          }
        } catch {
          // Called from a Server Component that can't set cookies — safe to
          // ignore as long as middleware is refreshing the session.
        }
      },
    },
  });
}
