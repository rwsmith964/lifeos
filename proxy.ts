// Next.js 16 renamed `middleware.ts` to `proxy.ts` (same behavior, new
// name/export — see node_modules/next/dist/docs/.../proxy.md). This proxy
// does ONE job: refresh the Supabase auth session cookie on every request,
// which is the standard @supabase/ssr pattern. It deliberately does NOT do
// route protection/redirects — Next 16's own docs recommend against
// leaning on Proxy for that ("recommended to be used as a last resort");
// each protected layout checks auth itself via createSupabaseServerClient()
// (see app/(app)/layout.tsx), which also keeps the check colocated with
// the RLS-scoped queries that depend on it.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    // Supabase isn't configured yet — nothing to refresh. Let the request
    // through; pages that need a session will handle the absence of one.
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
