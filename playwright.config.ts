import { defineConfig, devices } from "@playwright/test";

// D-148: E2E suite for the flows the manual QA passes have repeatedly
// caught bugs in (calendar CRUD, brain dump round trip, gift flow,
// nickname resolution, no-past-deadline math, cross-household isolation,
// mobile viewport). Runs against `next build && next start` in CI (see
// .github/workflows/verify.yml's new `e2e` job) or a local dev server when
// PLAYWRIGHT_BASE_URL is left unset.
//
// workers=1 / fullyParallel=false: several specs share the same signed-in
// Smith household state (calendar/gift/brain-dump data) and would race
// each other's assertions if run concurrently. The isolation spec also
// depends on nothing else having mutated the Jones household first.
// Chromium only — this is a correctness regression suite, not a
// cross-browser compatibility suite.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  timeout: 30_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
