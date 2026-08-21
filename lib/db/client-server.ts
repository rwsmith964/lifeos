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
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component that can't set cookies — safe to
          // ignore as long as middleware is refreshing the session.
        }
      },
    },
  });
}
