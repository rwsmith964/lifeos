// Deploy-time check for ANTHROPIC_API_KEY, run from package.json's build
// script. Warns by default; only exits non-zero (failing the build) when
// REQUIRE_ANTHROPIC_KEY=1 is set. Defaulting to a hard failure was judged
// too risky to turn on unilaterally the same pass the key still isn't
// configured — it would fail every deploy, including the ones shipping
// this remediation, until someone noticed and set it. See DECISIONS.md
// D-032 and KNOWN-ISSUES.md. Flip REQUIRE_ANTHROPIC_KEY=1 on in Vercel
// once the key is confirmed set, to get the brief's originally-requested
// hard-fail behavior.
if (!process.env.ANTHROPIC_API_KEY) {
  const message =
    "ANTHROPIC_API_KEY is not set — gift ideas, weekend planning, and Quick Capture will report themselves unavailable at runtime instead of working.";
  if (process.env.REQUIRE_ANTHROPIC_KEY === "1") {
    console.error(`\n✖ ${message}\n`);
    process.exit(1);
  }
  console.warn(`\n⚠ ${message}\n`);
}
