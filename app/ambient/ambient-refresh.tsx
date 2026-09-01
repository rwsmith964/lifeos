"use client";

// Module 5 (Ambient Display Mode, D-121): the ONLY interactive element on
// the ambient route, per the brief's verbatim scope ("no interactive
// controls beyond a refresh"). Everything else on the page is plain text.
//
// Why a full `window.location.reload()` on an interval rather than
// `router.refresh()` on a `setInterval`, or any client-side polling/
// re-fetching: the brief's other explicit requirement is "handles being
// left open for weeks — no memory leaks, no session expiry blowups." A
// tablet left on this route for weeks needs its JS heap and DOM reset
// periodically regardless of how careful the render code is (third-party
// libs, browser quirks, GPU compositing layers), and a full navigation is
// the one mechanism that unconditionally guarantees that — nothing
// "leaks" across a reload because nothing survives it. It also
// side-steps session expiry: every reload is a fresh request through
// proxy.ts, which refreshes the Supabase session cookie on every request
// (see proxy.ts) — so as long as the tablet reloads more often than the
// refresh token's lifetime, the session never has a chance to go stale
// and the page never "blows up" mid-render on an expired session; if the
// session is ever truly gone, the reload's own server render just
// redirects to /login like any other protected route, which is a normal
// state, not a crash. See QUEUE-020 for the interval length assumption.
import { useEffect } from "react";

const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes — QUEUE-020

export function AmbientRefresh() {
  useEffect(() => {
    const id = setInterval(() => {
      window.location.reload();
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="rounded-lg border border-white/20 px-6 py-3 text-xl font-medium text-white/70 transition-colors hover:border-white/40 hover:text-white"
      aria-label="Refresh"
    >
      Refresh
    </button>
  );
}
