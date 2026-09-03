import { test, expect } from "@playwright/test";
import { signIn, SMITH_CREDENTIALS, JONES_CREDENTIALS } from "./helpers/auth";

// D-148, spec 6 (MOST IMPORTANT): two-household data isolation. Every
// canary value in supabase/seed-e2e.sql embeds CANARY-JONES-9f21 -- a
// person note (private, on Jamie Jones the household's self-person),
// another person note (Jordan Jones), a calendar event's title/description
// /location, and a person_interest row. All belong to the Jones (E2E)
// household, never the Smith household Richard signs into.
//
// This is a genuine RLS regression test, not just "the UI doesn't show
// it": part 2 below fetches Jones-owned records *by their real database
// id* while signed in as Richard (Smith household) -- list-level
// filtering alone wouldn't catch a query that's missing a household_id
// clause but still gets a row back by primary key. Part 3 is the positive
// control: signed in as Jones, the same canary values must actually be
// visible, proving the seed data is real and the isolation check isn't
// trivially passing because the data was never there.
const CANARY = "CANARY-JONES-9f21";
const JAMIE_JONES_ID = "e2000000-0000-0000-0000-000000000001";
const JORDAN_JONES_ID = "e2000000-0000-0000-0000-000000000002";
const JONES_EVENT_ID = "e3000000-0000-0000-0000-000000000001";

test.describe("Two-household data isolation", () => {
  test("Smith household never sees Jones household data, including by direct id", async ({ page }) => {
    await signIn(page, SMITH_CREDENTIALS);

    // --- Part 1: list-level surfaces never mention the canary ---
    await page.goto("/people");
    await expect(page.getByText(CANARY)).toHaveCount(0);
    await expect(page.getByText("Jamie Jones")).toHaveCount(0);
    await expect(page.getByText("Jordan Jones")).toHaveCount(0);

    const eventDate = new Date();
    eventDate.setDate(eventDate.getDate() + 3);
    const [year, month] = eventDate.toISOString().slice(0, 10).split("-");
    await page.goto(`/calendar?month=${year}-${month}&day=${eventDate.toISOString().slice(0, 10)}`);
    await expect(page.getByText(CANARY)).toHaveCount(0);

    // --- Part 2: direct-id access to Jones-owned rows must not leak data ---
    await page.goto(`/people/${JAMIE_JONES_ID}`);
    await expect(page.getByText(CANARY)).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("Jamie Jones");

    await page.goto(`/people/${JORDAN_JONES_ID}`);
    await expect(page.getByText(CANARY)).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("Jordan Jones");

    await page.goto(`/calendar/${JONES_EVENT_ID}/edit`);
    await expect(page.getByText(CANARY)).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("Secret Jones household plan");

    // --- Part 3: positive control -- the Jones household DOES see its own data ---
    await signIn(page, JONES_CREDENTIALS);

    // The People list intentionally excludes the signed-in user's own
    // self-person (P0-5, app/(app)/people/page.tsx's excludeSelf query --
    // "self is who's using the app, not someone they're keeping track of").
    // So Jamie Jones (self) never appears here even for their own household;
    // only assert the non-self "Jordan Jones" shows up on this surface.
    // Jamie's own data is verified directly below via their person detail
    // page and the calendar, neither of which is subject to that exclusion.
    await page.goto("/people");
    await expect(page.getByText("Jordan Jones").first()).toBeVisible();

    await page.goto(`/people/${JAMIE_JONES_ID}`);
    await expect(page.getByText(CANARY).first()).toBeVisible();

    await page.goto(`/calendar?month=${year}-${month}&day=${eventDate.toISOString().slice(0, 10)}`);
    // The calendar page legitimately renders the same event title twice
    // here -- a truncated chip in the month grid AND the full title in
    // the selected-day agenda card below it (same dual-view pattern as
    // the month-grid-chip / day-agenda split used elsewhere on this
    // page). Positive-control assertion only (proving the Jones household
    // sees its own data) -- `.first()` matches the same pattern already
    // used just above for "Jordan Jones" and the CANARY person note; it
    // does not touch the negative isolation checks in Parts 1 and 2.
    await expect(page.getByText(`${CANARY} Family Event`).first()).toBeVisible();
  });
});
