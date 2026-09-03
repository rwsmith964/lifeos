// Deploy-time check for CRON_SECRET, run from package.json's build script,
// mirroring scripts/check-ai-config.mjs's REQUIRE_*-gated pattern.
//
// D-146 changed lib/http/cron-auth.ts to fail CLOSED in production when
// CRON_SECRET is missing (previously it failed open -- see D-093 and that
// file's own comment). Failing closed without this check would just trade
// one silent failure mode for another: instead of a silently-unauthenticated
// cron endpoint, you'd get a silently-401ing one, and Vercel's own scheduled
// invocations would start getting rejected too -- so daily briefs, gift
// scans, weekend plans, opportunity detection, and calendar sync would all
// simply stop running, with nothing in the UI or logs pointing at why. This
// check exists so that gets caught at build time, loudly, instead of
// discovered a day (or a week) later when nobody's brief showed up.
if (!process.env.CRON_SECRET) {
  const message =
    "CRON_SECRET is not set — every /api/cron/* route will now reject every request (including Vercel's own scheduled invocations), which will silently stop daily briefs, gift scans, weekend plans, opportunity detection, and calendar sync.";
  const isProduction = process.env.VERCEL_ENV === "production";
  if (isProduction || process.env.REQUIRE_CRON_SECRET === "1") {
    console.error(`\n✖ ${message}\n`);
    process.exit(1);
  }
  console.warn(`\n⚠ ${message}\n`);
}
