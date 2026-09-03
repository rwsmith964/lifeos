import { test, expect, type Locator, type Page } from "@playwright/test";
import { signIn, SMITH_CREDENTIALS } from "./helpers/auth";

// D-148, spec 1: create -> edit -> delete an event, reloading between each
// step so every assertion is against what the server actually persisted,
// not just optimistic client state. Selectors follow
// app/(app)/calendar/page.tsx and app/(app)/calendar/event-form.tsx: each
// day-agenda row is a Card whose CardContent holds the title text plus an
// "Edit event" icon link and a delete button — there is no dedicated
// event-detail page to navigate into first.
//
// This page's day-agenda cards render the title as a plain
// `<p class="text-sm font-medium">` inside CardContent -- there is no
// CardTitle (`data-slot="card-title"`), unlike the gift-suggestion cards
// helpers/fields.ts's `cardWithTitle` was built for. Reusing that helper
// here would never match, so this file scopes by an exact text match
// inside the Card instead.
function dayCardWithTitle(page: Page, titleText: string): Locator {
  return page.locator('[data-slot="card"]').filter({ has: page.getByText(titleText, { exact: true }) });
}

test.describe("Calendar event create/edit/delete", () => {
  test("create, edit, then delete an event survives a reload each time", async ({ page }) => {
    await signIn(page, SMITH_CREDENTIALS);

    // --- Create ---
    const title = `E2E Playwright Event ${Date.now()}`;
    const date = new Date();
    date.setDate(date.getDate() + 5);
    const dateStr = date.toISOString().slice(0, 10);

    await page.goto(`/calendar/new?date=${dateStr}`);
    await page.locator("#title").fill(title);
    await page.locator("#date").fill(dateStr);
    await page.locator("#location").fill("Test Location");
    await page.getByRole("button", { name: "Save event", exact: true }).click();

    // The form posts to /api/calendar/events and redirects back to the
    // calendar view (anchored on that day) on success.
    await page.waitForURL(/\/calendar/, { timeout: 15_000 });

    // Reload and confirm the event is really in the database, not just
    // held in client state.
    await page.reload();
    let row = dayCardWithTitle(page, title);
    await expect(row).toBeVisible({ timeout: 10_000 });

    // --- Edit ---
    await row.getByRole("link", { name: "Edit event" }).click();
    await page.waitForURL(/\/calendar\/.+\/edit/);

    await expect(page.locator("#title")).toHaveValue(title);
    const updatedTitle = `${title} (edited)`;
    await page.locator("#title").fill(updatedTitle);
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.waitForURL(/\/calendar/, { timeout: 15_000 });

    await page.reload();
    row = dayCardWithTitle(page, updatedTitle);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);

    // --- Delete ---
    await row.getByRole("button", { name: "Delete event" }).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Delete this event?")).toBeVisible();
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(page.getByText("Event deleted.")).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page.getByText(updatedTitle)).toHaveCount(0);
  });
});
