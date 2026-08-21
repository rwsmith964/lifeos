import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "./env";

/**
 * Bypasses RLS entirely. Only for cron jobs and system processes that write
 * rows no authenticated user session exists for (brief generation, external
 * data cache writes, ai_usage_log, notification dispatch — see the "no
 * insert policy for regular users" comments in the relevant migrations).
 *
 * Never import this into a Server/Client Component or a route handler that
 * runs on behalf of a logged-in user's request — use
 * `createSupabaseServerClient()` there so RLS stays the enforcement layer.
 */
export function createSupabaseServiceRoleClient() {
  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
