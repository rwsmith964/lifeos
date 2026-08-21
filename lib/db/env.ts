// Central place that reads and validates Supabase env vars, so a missing
// var fails loudly and immediately (Section 12.4) instead of surfacing as a
// confusing runtime error three layers deep in a repository call.
//
// Supabase itself is not behind a "no key needed" stub like the optional
// integrations (AI, email, maps, external data adapters) — it's the
// mandatory persistence layer per Section 3, not an "external integration."
// `pnpm dev` needs a running Supabase instance (local via `supabase start`,
// or a hosted project's URL/anon key); it does NOT need ANY other API key.
// See DECISIONS.md D-013.

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env.local and fill in your Supabase project's URL/keys (see README for \`supabase start\`).`
    );
  }
  return value;
}

export function getSupabaseUrl(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_URL");
}

export function getSupabaseAnonKey(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export function getSupabaseServiceRoleKey(): string {
  return requireEnv("SUPABASE_SERVICE_ROLE_KEY");
}
