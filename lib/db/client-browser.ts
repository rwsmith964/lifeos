"use client";

import { createBrowserClient } from "@supabase/ssr";

// Deliberately NOT using lib/db/env.ts's getSupabaseUrl()/getSupabaseAnonKey()
// here (J-series regression found in Phase 14 verification): those go
// through a `process.env[name]` dynamic lookup, which works fine
// server-side (the full environment is present at runtime) but breaks in
// the browser bundle -- Next only inlines `NEXT_PUBLIC_*` vars into
// client code it can statically see as a literal `process.env.THE_NAME`
// property access, not a variable-keyed one. Server-only client-server.ts
// and client-service-role.ts can keep using the shared helper; this is the
// one client-side caller, so it reads the two vars directly.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function createSupabaseBrowserClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill in your Supabase project's URL/keys (see README for `supabase start`)."
    );
  }
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
