import { test, expect } from "@playwright/test";
import { signIn, SMITH_CREDENTIALS } from "./helpers/auth";

// D-148, spec 4: nickname resolution end to end through Quick Capture
// (components/capture/capture-button.tsx -> app/api/capture/route.ts).
// "Cal" is Callan Smith's nickname (supabase/seed.sql). The real pipeline
// runs for real here -- lib/ai/context.ts's buildChildTokenMap/redactMentions
// turns "Cal" into a CHILD_N token before the (faked) model call, and
// test-fixtures.ts's fixture reads that token back off the roster to
// resolve the real personId, so this spec exercises the app's own
// nickname -> token -> person id -> action pipeline, not the fixture.
//
// A successful save (status "ready", no clarifying question needed since
// the person resolved) renders a confirmation bubble whose text always
// starts with "Saved —" (app/api/capture/route.ts), restoring the token
// back to the person's real display name. That's used here instead of a
// DOM-level tone attribute (the panel doesn't expose one) to distinguish
// a real confirmation from a needs_clarification question bubble.
test.describe("Nickname resolution via Quick Capture", () => {
  test("using a nickname resolves to the right person without asking for clarification", async ({ page }) => {
    await signIn(page, SMITH_CREDENTIALS);
    await page.goto("/");

    await page.getByRole("button", { name: "Quick capture" }).click();
    const input = page.getByPlaceholder("Type or dictate a note…");
    await expect(input).toBeVisible();
    await input.fill("Cal really wants to try rock climbing");
    await input.press("Enter");

    // The `^` anchor matters here: the scrollable turns container also
    // matches a loose text search since it concatenates every turn's text,
    // but only the confirmation bubble's own text actually *starts with*
    // "Saved —" (the preceding user turn is whatever was typed above).
    const confirmation = page.getByText(/^Saved —.*rock climbing/i);
    await expect(confirmation).toBeVisible({ timeout: 20_000 });
  });
});
