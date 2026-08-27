import { headers } from "next/headers";

// Vercel's proxy sets these; localhost dev has no x-forwarded-* headers at
// all, so falls back to plain http on whatever host was requested. Used to
// build absolute redirect/link URLs from Server Actions, which (unlike
// Route Handlers) have no `request` object to build one from directly.
// Extracted out of app/actions.ts (originally written for the
// password-reset email link) so the household-invite email can build its
// accept-URL the same way instead of duplicating the header-sniffing logic.
//
// This file imports "next/headers" and so is server-only — the sibling
// `isSafeRedirectPath` helper lives in its own ./safe-redirect.ts module
// instead (no re-export here), since that one is also imported directly
// from client components (login/signup pages) and re-exporting it from
// this file would drag next/headers into the client bundle right along
// with it — Turbopack build failed on exactly that the first time this
// was tried.
export async function getSiteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
