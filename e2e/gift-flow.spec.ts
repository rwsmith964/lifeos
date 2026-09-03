import { test, expect, type Locator, type Page } from "@playwright/test";
import { signIn, SMITH_CREDENTIALS } from "./helpers/auth";

// The fixture always returns the SAME three titles (Alpha/Beta/Gamma) for
// every person -- see AI_TEST_MODE's buildGiftSuggestionFixtureJson. The
// two tests below generate for different people (Emma, Callan) in the same
// signed-in session, and /gifts renders every household member's active
// suggestions on one page grouped under a per-person <h2>. A bare
// `cardWithTitle(page, ...)` (as used elsewhere for single-subject pages
// like brain-dump/calendar) is therefore ambiguous here: if an earlier
// test in this file left its same-titled card on the page (e.g. beta
// un-dismissed back to "suggested" at the end of the save/dismiss test),
// a person-agnostic lookup resolves to more than one element. Scope every
// lookup to the specific person's <section> instead.
function personSection(page: Page, personName: string): Locator {
  return page.locator("section").filter({ has: page.getByRole("heading", { level: 2, name: personName, exact: true }) });
}

function cardWithTitleFor(page: Page, personName: string, titleText: string): Locator {
  return personSection(page, personName).locator('[data-slot="card"]').filter({
    has: page.locator('[data-slot="card-title"]', { hasText: titleText }),
  });
}

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
  // The person page renders two separate forms with an "Occasion date"
  // field -- GenerateSuggestionsForm ("Get gift ideas") and RecordGiftForm
  // ("Record gift", for logging a past gift) -- so a bare page-level
  // getByLabel is ambiguous (Playwright strict-mode violation). Scope to
  // the form that actually contains the "Get gift ideas" button.
  const generateForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Get gift ideas", exact: true }) });
  await generateForm.getByLabel("Occasion date").fill(occasionDatePlus15());
  await generateForm.getByRole("button", { name: "Get gift ideas", exact: true }).click();
  await page.waitForURL(/\/gifts$/, { timeout: 20_000 });
}

test.describe("Gift suggestions", () => {
  test("save, dismiss, and undo update suggestion status with visible feedback", async ({ page }) => {
    await signIn(page, SMITH_CREDENTIALS);
    await generateFixtureSuggestions(page, EMMA_PERSON_ID);

    const alpha = cardWithTitleFor(page, "Emma Smith", "Fixture Gift Alpha");
    const beta = cardWithTitleFor(page, "Emma Smith", "Fixture Gift Beta");
    await expect(alpha).toBeVisible({ timeout: 10_000 });
    await expect(beta).toBeVisible();

    // --- Save ---
    await alpha.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status").getByText("Saved to shortlist.")).toBeVisible({ timeout: 10_000 });
    // P1-12 (app/(app)/gifts/page.tsx): /gifts only ever queries
    // status === "suggested" -- once a suggestion is saved it moves OFF
    // this list entirely and onto the dedicated Saved gifts page, the
    // same way Dismiss already removes a card. It does not flip to a
    // "Saved" badge in place here; two earlier CI runs (33728088223,
    // 33729007411) mis-diagnosed the resulting `toBeVisible` timeout as
    // router.refresh() taking longer than budgeted, when the real cause
    // is that the assertion was looking for the badge on the wrong page.
    // `alpha` is re-evaluated live by Playwright, so this polls until the
    // post-refresh render actually drops the card.
    await expect(alpha).toBeHidden({ timeout: 20_000 });

    await page.goto("/gifts/saved");
    const savedAlpha = cardWithTitleFor(page, "Emma Smith", "Fixture Gift Alpha");
    await expect(savedAlpha).toBeVisible({ timeout: 10_000 });
    await expect(savedAlpha.getByText("Saved", { exact: true })).toBeVisible();
    await expect(savedAlpha.getByRole("button", { name: "Mark ordered", exact: true })).toBeVisible();

    // Persists across a reload, not just optimistic client state.
    await page.reload();
    await expect(cardWithTitleFor(page, "Emma Smith", "Fixture Gift Alpha")).toBeVisible({ timeout: 10_000 });

    // --- Dismiss + Undo ---
    await page.goto("/gifts");
    const betaAfterReload = cardWithTitleFor(page, "Emma Smith", "Fixture Gift Beta");
    await betaAfterReload.getByRole("button", { name: "Dismiss", exact: true }).click();
    const dismissToast = page.getByRole("status").filter({ hasText: "Dismissed." });
    await expect(dismissToast).toBeVisible({ timeout: 10_000 });

    await dismissToast.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.getByRole("status")).not.toContainText("Dismissed.", { timeout: 10_000 });

    await page.reload();
    const betaRestored = cardWithTitleFor(page, "Emma Smith", "Fixture Gift Beta");
    await expect(betaRestored).toBeVisible({ timeout: 10_000 });
    await expect(betaRestored.getByRole("button", { name: "Save", exact: true })).toBeVisible();
    await expect(betaRestored.getByRole("button", { name: "Dismiss", exact: true })).toBeVisible();
  });

  test("order-by status never renders a past-tense date", async ({ page }) => {
    await signIn(page, SMITH_CREDENTIALS);
    await generateFixtureSuggestions(page, CALLAN_PERSON_ID);

    const orderByText = (card: import("@playwright/test").Locator) =>
      card.locator("p").filter({ hasText: /left to order|Needed now/ });

    const alpha = cardWithTitleFor(page, "Callan Smith", "Fixture Gift Alpha"); // furniture, past due
    const beta = cardWithTitleFor(page, "Callan Smith", "Fixture Gift Beta"); // standard, future
    const gamma = cardWithTitleFor(page, "Callan Smith", "Fixture Gift Gamma"); // digital, future

    await expect(alpha).toBeVisible({ timeout: 10_000 });
    await expect(orderByText(alpha)).toHaveText("Needed now");
    await expect(orderByText(alpha)).toHaveClass(/text-destructive/);

    await expect(orderByText(beta)).toHaveText(/^\d+ days? left to order$/);
    await expect(orderByText(beta)).not.toHaveClass(/text-destructive/);

    await expect(orderByText(gamma)).toHaveText(/^\d+ days? left to order$/);
    await expect(orderByText(gamma)).not.toHaveClass(/text-destructive/);
  });
});
