import { timingSafeEqual } from "node:crypto";

// D-093 found that CRON_SECRET had never actually been set in Vercel
// production, so every cron route's `isAuthorized` check -- correctly
// written, but built around a fail-OPEN default ("no secret configured —
// allow") -- had been silently granting anyone who knew a route's URL the
// same access as Vercel's own scheduled invocations, for as long as the
// env var was absent. D-093's fix was to set the env var, not to change
// the fail-open default, so the hole reopens the moment CRON_SECRET is
// ever unset again in any environment (a redeploy, a new preview env, a
// dropped Vercel setting) -- and nothing would surface that, because the
// routes would just keep returning 200.
//
// This helper intentionally fails CLOSED instead: with no CRON_SECRET set,
// it authorizes requests only outside production (local dev, and
// `pnpm test`, both need this to "just work" with no ceremony -- see
// AGENTS.md / the additive-contract "pnpm dev needs zero API keys"
// principle). In production, a missing secret now means every cron
// request is rejected, including Vercel's own -- see
// scripts/check-cron-config.mjs, which fails the *build* in that
// situation so the outage is caught before deploy, not discovered a day
// later when no briefs go out. Do not restore the old `if (!secret)
// return true` default: that is the exact bug this file exists to close.
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const header = request.headers.get("authorization");
  if (!header) return false;

  const expected = `Bearer ${secret}`;

  // timingSafeEqual throws on a length mismatch rather than returning
  // false, and requires equal-length buffers -- compare lengths first so a
  // wrong-length header can never even reach it, then do the constant-time
  // comparison so a correct-length-but-wrong-value header isn't
  // distinguishable from a match by response timing.
  const headerBuf = Buffer.from(header);
  const expectedBuf = Buffer.from(expected);
  if (headerBuf.length !== expectedBuf.length) return false;

  return timingSafeEqual(headerBuf, expectedBuf);
}
