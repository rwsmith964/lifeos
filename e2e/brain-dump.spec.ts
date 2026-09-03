import { test, expect } from "@playwright/test";
import { signIn, SMITH_CREDENTIALS } from "./helpers/auth";
import { cardWithTitle } from "./helpers/fields";
import { FIXTURE_EVENT_DATE, FIXTURE_TIME_OFF_START, FIXTURE_TIME_OFF_END } from "../lib/ai/test-fixtures";

// D-148, spec 2: Brain Dump round trip against the AI_TEST_MODE fixture
// (lib/ai/test-fixtures.ts). A transcript with no child name/nickname in
// it gets the fixed two-item fixture response: one create_calendar_event
// and one add_time_off, both pre-filled by the (faked) parse step. This
// spec verifies the whole pipeline end to end: parse -> review UI shows
// the right pre-filled values -> Save -> the resulting rows are visible
// on the pages that read them back (calendar, and the time-off count on
// the brief/dashboard isn't asserted here since it isn't confirmed yet --
// the calendar event is the strongest signal since /calendar renders
// directly from calendar_items).
test.describe("Brain Dump round trip", () => {
  test("processing a transcript creates a real calendar event and time off entry", async ({ page }) => {
    await signIn(page, SMITH_CREDENTIALS);
    await page.goto("/brain-dump");

    await page.locator("textarea").fill(
      "Need to jot a couple things down for the week ahead, nothing about the kids specifically."
    );
    await page.getByRole("button", { name: "Process", exact: true }).click();

    const eventCard = cardWithTitle(page, "Add dentist follow-up to the calendar");
    const timeOffCard = cardWithTitle(page, "Add time off for the Seattle trip");
    await expect(eventCard).toBeVisible({ timeout: 20_000 });
    await expect(timeOffCard).toBeVisible();

    // Pre-filled fields from the fixture, per lib/ai/test-fixtures.ts.
    await expect(eventCard.locator("input").first()).toHaveValue("E2E Fixture Dentist Follow-up");
    await expect(eventCard.locator('input[type="date"]')).toHaveValue(FIXTURE_EVENT_DATE);

    await expect(timeOffCard.locator('input[type="date"]').first()).toHaveValue(FIXTURE_TIME_OFF_START);
    await expect(timeOffCard.locator('input[type="date"]').nth(1)).toHaveValue(FIXTURE_TIME_OFF_END);

    // Save both items.
    await eventCard.getByRole("button", { name: "Save", exact: true }).click();
    await expect(eventCard.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10_000 });

    await timeOffCard.getByRole("button", { name: "Save", exact: true }).click();
    await expect(timeOffCard.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10_000 });

    // Verify the calendar event round-tripped into the actual database by
    // navigating to the day it landed on and reloading.
    const [year, month] = FIXTURE_EVENT_DATE.split("-");
    await page.goto(`/calendar?month=${year}-${month}&day=${FIXTURE_EVENT_DATE}`);
    await page.reload();
    await expect(cardWithTitle(page, "E2E Fixture Dentist Follow-up")).toBeVisible({ timeout: 10_000 });
  });
});
