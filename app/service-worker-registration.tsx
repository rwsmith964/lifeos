"use client";

import { useEffect } from "react";

/**
 * Registers the minimal service worker (public/sw.js) so the app meets
 * PWA installability criteria (manifest + active service worker). A pure
 * progressive enhancement — no-ops in browsers without support, and
 * silently swallows registration failures (e.g. this app's own
 * /computer/a preview runs inside a sandboxed iframe where service
 * worker registration is blocked) since neither case should be
 * surfaced to the user or affect the app's normal function.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Ignore — see comment above.
    });
  }, []);

  return null;
}
