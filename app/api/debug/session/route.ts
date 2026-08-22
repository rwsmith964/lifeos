// TEMPORARY diagnostic route — not part of the app, will be deleted once
// the production login/session issue is root-caused. Reports what cookies
// arrived and what Supabase's server client makes of them.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/db/client-server";

export async function GET() {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll().map((c) => ({ name: c.name, length: c.value.length }));

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  return NextResponse.json({
    cookieCount: allCookies.length,
    cookies: allCookies,
    user: data.user ? { id: data.user.id, email: data.user.email } : null,
    error: error ? { message: error.message, status: error.status } : null,
  });
}
