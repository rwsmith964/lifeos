import { test, expect } from "@playwright/test";
import { signIn, SMITH_CREDENTIALS } from "./helpers/auth";
import { cardWithTitle } from "./helpers/fields";

// D-148, specs 3 & 5: gift suggestion generation, save/dismiss/undo, and
// the "never show a past-tense order-by date" rule (lib/gifts/leadtime.ts
// orderByStatusLabel). Both specs generate against the AI_TEST_MODE
// fixture (lib/ai/test-fixtures.ts buildGiftSuggestionFixtureJson), which
// always returns the same three items -- "Fixture Gift Alpha" (furniture,
// 21-day shipping window), "Fixture Gift Beta" (standard, 5-day), "Fixture
// Gift Gamma" (digital, 0-day). Household default buffers are 2 handling +
// 2 personal days (see gift_shipping_windows migration), so total buffer
// per category is shipping + 4: furniture 25, standard 9, digital 4.
//
// Choosing occasionDate = today + 15 days makes furniture's order-by date
// (occasionDate - 25 = today - 10) already past, while standard's
// (occasionDate - 9 = today + 6) and digital's (occasionDate - 4 =
// today + 11) are still comfortably in the future -- one past-due
// suggestion and two future ones from a single generation, with enough
// margin (multiple days each side) to be robust to timezone rounding
// between the test runner and the server.
function occasionDatePlus15(): string {
  const d = new Date();
  d.setDate(d.getDate() + 15);
  return d.toISOString().slice(0, 10);
}

const EMMA_PERSON_ID = "30000000-0000-0000-0000-000000000003";
const CALLAN_PERSON_ID = "3000000d-0000-0000-0000-000000000001";

async function generateFixtureSuggestions(page: import("@playwright/test").Page, personId: string) {
  await page.goto(`/people/${personId}`);
  await page.getByLabel("Occasion date").fill(occasionDatePlus15());
  await page.getByRole("button", { name: "Get gift ideas", exact: true }).click();
  await page.waitForURL(/\/gifts$/, { timeout: 20_000 });
}

test.describe("Gift suggestions", () => {
  test("save, dismiss, and undo update suggestion status with visible feedback", async ({ page }) => {
    await signIn(page, SMITH_CREDENTIALS);
    await generateFixtureSuggestions(page, EMMA_PERSON_ID);

    const alpha = cardWithTitle(page, "Fixture Gift Alpha");
    const beta = cardWithTitle(page, "Fixture Gift Beta");
    await expect(alpha).toBeVisible({ timeout: 10_000 });
    await expect(beta).toBeVisible();

    // --- Save ---
    await alpha.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status").getByText("Saved to shortlist.")).toBeVisible({ timeout: 10_000 });
    await expect(alpha.getByText("Saved", { exact: true })).toBeVisible();
    await expect(alpha.getByRole("button", { name: "Mark ordered", exact: true })).toBeVisible();

    await page.reload();
    await expect(cardWithTitle(page, "Fixture Gift Alpha").getByText("Saved", { exact: true })).toBeVisible({
      timeout: 10_000,
    });

    await page.goto("/gifts/saved");
    await expect(cardWithTitle(page, "Fixture Gift Alpha")).toBeVisible({ timeout: 10_000 });

    // --- Dismiss + Undo ---
    await page.goto("/gifts");
    const betaAfterReload = cardWithTitle(page, "Fixture Gift Beta");
    await betaAfterReload.getByRole("button", { name: "Dismiss", exact: true }).click();
    const dismissToast = page.getByRole("status").filter({ hasText: "Dismissed." });
    await expect(dismissToast).toBeVisible({ timeout: 10_000 });

    await dismissToast.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.getByRole("status")).not.toContainText("Dismissed.", { timeout: 10_000 });

    await page.reload();
    const betaRestored = cardWithTitle(page, "Fixture Gift Beta");
    await expect(betaRestored).toBeVisible({ timeout: 10_000 });
    await expect(betaRestored.getByRole("button", { name: "Save", exact: true })).toBeVisible();
    await expect(betaRestored.getByRole("button", { name: "Dismiss", exact: true })).toBeVisible();
  });

  test("order-by status never renders a past-tense date", async ({ page }) => {
    await signIn(page, SMITH_CREDENTIALS);
    await generateFixtureSuggestions(page, CALLAN_PERSON_ID);

    const orderByText = (card: import("@playwright/test").Locator) =>
      card.locator("p").filter({ hasText: /left to order|Needed now/ });

    const alpha = cardWithTitle(page, "Fixture Gift Alpha"); // furniture, past due
    const beta = cardWithTitle(page, "Fixture Gift Beta"); // standard, future
    const gamma = cardWithTitle(page, "Fixture Gift Gamma"); // digital, future

    await expect(alpha).toBeVisible({ timeout: 10_000 });
    await expect(orderByText(alpha)).toHaveText("Needed now");
    await expect(orderByText(alpha)).toHaveClass(/text-destructive/);

    await expect(orderByText(beta)).toHaveText(/^\d+ days? left to order$/);
    await expect(orderByText(beta)).not.toHaveClass(/text-destructive/);

    await expect(orderByText(gamma)).toHaveText(/^\d+ days? left to order$/);
    await expect(orderByText(gamma)).not.toHaveClass(/text-destructive/);
  });
});
