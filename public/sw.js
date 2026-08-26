// Minimal service worker — exists primarily to satisfy PWA installability
// criteria (an active service worker controlling the page). Deliberately
// does NOT cache any page or API response: every route in this app is
// session-dependent (see app/layout.tsx's `force-dynamic` comment and
// DECISIONS.md D-031, where a cached response served stale auth state to
// the wrong session) — caching HTML/API here would risk the exact same
// class of bug at the browser layer instead of Vercel's edge. Only the
// handful of static icon files are cache-first; everything else is
// network-only passthrough (letting the browser's own HTTP cache handle
// fonts/JS/CSS as normal).
const STATIC_CACHE = "lifeos-static-v1";
const STATIC_ASSETS = ["/icon-192.png", "/icon-512.png", "/icon-512-maskable.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
  }
  // Everything else (pages, API routes, fonts, etc.) falls through to the
  // network exactly as if no service worker were installed.
});
