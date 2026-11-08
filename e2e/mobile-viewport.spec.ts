import { test, expect } from "@playwright/test";
import { signIn, SMITH_CREDENTIALS } from "./helpers/auth";

// D-148, spec 7: mobile viewport. app/(app)/layout.tsx renders two
// completely different navigation surfaces from the same NAV_ITEMS list --
// a desktop sidebar (`hidden lg:flex`, rendered first in DOM order) and a
// fixed bottom nav (`lg:hidden`, rendered second) -- both containing links
// with the same accessible names, so `nav.last()` is what scopes every
// lookup below to the one actually visible at mobile widths instead of
// silently matching its desktop twin.
test.use({ viewport: { width: 375, height: 812 } }); // iPhone-ish width, per Section 3's mobile-first requirement

test.describe("Mobile viewport", () => {
  test("mobile chrome renders correctly and every bottom-nav destination is reachable without horizontal overflow", async ({
    page,
  }) => {
    await signIn(page, SMITH_CREDENTIALS);
    await page.goto("/");

    const bottomNav = page.locator("nav").last();
    await expect(bottomNav).toBeVisible();
    // The desktop sidebar's nav must not also be visible at this width.
    await expect(page.locator("nav").first()).toBeHidden();

    // The bottom bar deliberately holds only four destinations around the
    // centred capture button (Today, Calendar, People, Plan -- see
    // MOBILE_NAV_ITEMS in app/(app)/layout.tsx); Gifts/Household/Brain dump
    // are reached from inside the app, and Settings from a header link
    // rather than the bottom bar.
    const destinations: Array<[string, string | RegExp, "bottom" | "header"]> = [
      ["People", /\/people$/, "bottom"],
      ["Calendar", /\/calendar$/, "bottom"],
      ["Plan", /\/activities$/, "bottom"],
      ["Today", /\/$/, "bottom"],
      ["Settings", /\/settings$/, "header"],
    ];

    for (const [label, urlPattern, where] of destinations) {
      const scope = where === "bottom" ? bottomNav : page.locator("header");
      await scope.getByRole("link", { name: label, exact: true }).click();
      await page.waitForURL(urlPattern, { timeout: 10_000 });

      const overflowWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const viewportWidth = await page.evaluate(() => window.innerWidth);
      expect(overflowWidth, `${label} page should not cause horizontal overflow`).toBeLessThanOrEqual(
        viewportWidth + 1
      );

      await expect(bottomNav).toBeVisible();
    }

    // Quick capture panel must also fit the viewport without introducing
    // horizontal scroll.
    await page.getByRole("button", { name: "Add or dump a thought", exact: true }).click();
    await expect(page.getByPlaceholder("Add or dump a thought…")).toBeVisible();
    const overflowWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(overflowWidth).toBeLessThanOrEqual(viewportWidth + 1);

    await page.getByRole("button", { name: "Close", exact: true }).click();
  });
});
