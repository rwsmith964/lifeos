"use client";

// I2 (audit pass 2026-09-11): "The session dropped mid-use with no
// warning and replaced the page with a bare sign-in screen... refresh the
// token silently while the tab is active." The app had a browser-side
// Supabase client factory (lib/db/client-browser.ts) but nothing ever
// actually instantiated it -- proxy.ts refreshes the session on every
// *navigation*, but a tab sitting idle with no navigation (reading a long
// briefing, filling out a form) had no live client-side session at all,
// so the cookie could quietly expire with nothing keeping it alive or
// watching for it. This mounts once per app session, keeps one real
// browser client alive, nudges Supabase's own built-in near-expiry
// refresh periodically while the tab is visible (and immediately when the
// tab regains focus after being hidden), and -- if a refresh ever
// genuinely fails -- shows a toast with a sign-in link that preserves the
// current path, instead of letting the next server request silently bounce
// to a bare /login with no way back.
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/db/client-browser";
import { useToast } from "@/components/ui/toast";

const REFRESH_CHECK_INTERVAL_MS = 4 * 60 * 1000;

export function SessionKeepAlive() {
  const { showToast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  // Latest-value ref, updated from an effect (not during render -- this
  // project's react-hooks/refs rule forbids mutating a ref while
  // rendering) so the SIGNED_OUT handler below always reads the current
  // path without needing to re-subscribe on every navigation.
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);
  const warnedRef = useRef(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && !warnedRef.current) {
        warnedRef.current = true;
        const next = encodeURIComponent(pathnameRef.current || "/");
        showToast({
          title: "Your session expired",
          description: "Sign in again to keep going — you'll come back to where you were.",
          variant: "destructive",
          durationMs: 30000,
          action: { label: "Sign in", onClick: () => router.push(`/login?next=${next}`) },
        });
      }
    });

    function checkSession() {
      if (document.visibilityState !== "visible") return;
      // getSession() triggers the browser client's own built-in
      // near-expiry auto-refresh -- this is a nudge, not a manual refresh
      // implementation; Supabase already knows how to refresh its own
      // token, it just needed something to periodically ask.
      void supabase.auth.getSession();
    }

    const interval = setInterval(checkSession, REFRESH_CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", checkSession);
    // Catch a tab that was hidden/asleep for a long stretch and just came back.
    checkSession();

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", checkSession);
    };
  }, [showToast, router]);

  return null;
}
