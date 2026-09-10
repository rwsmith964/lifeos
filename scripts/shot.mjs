#!/usr/bin/env node
// Self-verification tool for the redesign (docs/redesign-brief.md). Starts
// the dev server if it isn't already running, navigates to a route, and
// saves a screenshot to docs/shots/<name>.png -- so a screen's actual
// rendered output can be compared against docs/design/<name>.png (or just
// inspected directly) instead of trusting a self-report that it "looks
// right." See lifeos-layout-continuation.md's whole premise: nothing
// forces a look unless something takes the screenshot.
//
// Every real route in this app is session-gated, so this authenticates
// once (LIFEOS_SHOT_EMAIL/LIFEOS_SHOT_PASSWORD env vars, e.g. in
// .env.local -- never hardcoded here) and caches Playwright storage state
// at docs/shots/.auth-state.json (gitignored) for fast repeat runs during
// an iterate-and-fix loop.
//
// Usage: node scripts/shot.mjs <name> <route> [--width=1440] [--height=980]
//   node scripts/shot.mjs today /
//   node scripts/shot.mjs people /people
//   node scripts/shot.mjs calendar /calendar
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import net from "node:net";

const DEV_PORT = 3000;
const DEV_URL = `http://localhost:${DEV_PORT}`;
const AUTH_STATE_PATH = path.join(process.cwd(), "docs", "shots", ".auth-state.json");

function parseArgs(argv) {
  const [name, route, ...rest] = argv;
  if (!name || !route) {
    console.error("Usage: node scripts/shot.mjs <name> <route> [--width=1440] [--height=980]");
    process.exit(1);
  }
  let width = 1440;
  let height = 980;
  for (const arg of rest) {
    const w = /^--width=(\d+)$/.exec(arg);
    const h = /^--height=(\d+)$/.exec(arg);
    if (w) width = Number(w[1]);
    if (h) height = Number(h[1]);
  }
  return { name, route, width, height };
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: "localhost" }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.setTimeout(500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortOpen(DEV_PORT)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Dev server did not come up on port ${DEV_PORT} within ${timeoutMs}ms`);
}

async function ensureDevServer() {
  if (await isPortOpen(DEV_PORT)) return;
  console.log(`[shot] Starting dev server on port ${DEV_PORT}...`);
  const child = spawn("pnpm", ["dev"], {
    cwd: process.cwd(),
    stdio: "ignore",
    shell: true,
    detached: true,
  });
  child.unref();
  await waitForServer();
  console.log("[shot] Dev server is up.");
}

async function hasUsableAuthState() {
  try {
    await readFile(AUTH_STATE_PATH, "utf8");
    return true;
  } catch {
    return false;
  }
}

async function login(browser) {
  const email = process.env.LIFEOS_SHOT_EMAIL;
  const password = process.env.LIFEOS_SHOT_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "No cached auth state and LIFEOS_SHOT_EMAIL/LIFEOS_SHOT_PASSWORD aren't set. " +
        "Add them to .env.local (never commit real credentials) so this script can log in once and cache the session."
    );
  }
  console.log("[shot] No cached session -- logging in...");
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(new URL("/login", DEV_URL).toString(), { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });
  await mkdir(path.dirname(AUTH_STATE_PATH), { recursive: true });
  await context.storageState({ path: AUTH_STATE_PATH });
  await context.close();
  console.log("[shot] Logged in, session cached.");
}

async function main() {
  const { name, route, width, height } = parseArgs(process.argv.slice(2));
  await ensureDevServer();

  const outDir = path.join(process.cwd(), "docs", "shots");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${name}.png`);

  const browser = await chromium.launch();

  if (!(await hasUsableAuthState())) {
    await login(browser);
  }

  let context = await browser.newContext({ storageState: AUTH_STATE_PATH, viewport: { width, height } });
  let page = await context.newPage();
  let url = new URL(route, DEV_URL).toString();
  await page.goto(url, { waitUntil: "networkidle" });

  // Cached session may have expired -- if we landed on /login, re-auth once
  // and retry the real navigation.
  if (new URL(page.url()).pathname.startsWith("/login")) {
    await context.close();
    await login(browser);
    context = await browser.newContext({ storageState: AUTH_STATE_PATH, viewport: { width, height } });
    page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
  }

  // Let fonts/animations settle -- Instrument Serif/Manrope are web fonts
  // (next/font), and a screenshot taken before they swap in would show the
  // fallback face, not the real one.
  await page.waitForTimeout(500);

  // Next.js dev mode's own error overlay (distinct from the real app) can
  // render full-screen over a benign console error this sandbox always
  // throws (eval() blocked by CSP -- a dev-tooling quirk, not a real bug;
  // confirmed production builds are unaffected). Dismiss it so the
  // screenshot shows the actual page, the same way a real user would just
  // ignore/close it rather than have it block their view.
  await page.keyboard.press("Escape").catch(() => {});
  const overlayCloseButton = page.locator('[aria-label="Close"]').first();
  if (await overlayCloseButton.isVisible().catch(() => false)) {
    await overlayCloseButton.click().catch(() => {});
  }
  await page.waitForTimeout(200);

  await page.screenshot({ path: outPath, fullPage: false });
  await context.close();
  await browser.close();

  console.log(`[shot] Saved ${outPath} (${width}x${height}, route: ${route})`);
}

main().catch((error) => {
  console.error("[shot] Failed:", error);
  process.exit(1);
});
