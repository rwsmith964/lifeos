// Custom 404 (Phase 3 backlog) — without this file, Next falls back to its
// bare unstyled default "404 | This page could not be found." with no
// branding, no nav, and no way back into the app short of hitting the
// browser's back button.
//
// This checks auth state directly rather than going through
// requireHouseholdContext() (lib/auth/session.ts), because that helper
// redirects on a missing session/household — exactly the opposite of what
// a 404 page should do. A 404 needs to render for anyone, logged in or
// not, and just point them somewhere sensible.
import Link from "next/link";
import { Compass } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/db/client-server";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";

export default async function NotFound() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const homeHref = user ? "/calendar" : "/login";

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <Compass className="size-10 text-muted-foreground" aria-hidden="true" />
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          That page doesn&apos;t exist, or it moved. {APP_NAME} can still get you back to something useful.
        </p>
      </div>
      <Button asChild>
        <Link href={homeHref}>{user ? "Go to calendar" : "Go to sign in"}</Link>
      </Button>
    </div>
  );
}
