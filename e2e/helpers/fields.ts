import type { Locator, Page } from "@playwright/test";

/**
 * Locates a shadcn `<Card>` (components/ui/card.tsx, `data-slot="card"`)
 * whose `<CardTitle>` (`data-slot="card-title"`) contains the given text.
 * Used to scope field/button lookups to one review card or gift-suggestion
 * card among several rendered at once, since these components carry no
 * other stable per-item test id.
 */
export function cardWithTitle(page: Page, titleText: string | RegExp): Locator {
  return page.locator('[data-slot="card"]').filter({ has: page.locator('[data-slot="card-title"]', { hasText: titleText }) });
}

/**
 * Brain Dump's review-card fields (app/(app)/brain-dump/brain-dump-client.tsx)
 * render `<Label>Text</Label>` as a plain sibling of the `<Input>`/`<select>`
 * it labels, inside a shared `div.flex.flex-col.gap-1` wrapper — there is no
 * `htmlFor`/`id` link between them, so Playwright's `getByLabel` can't
 * resolve these fields. This locates the wrapper by its exact label text
 * (via the `:text-is()` exact-match pseudo, since "Date" must not also
 * match "Start date") and returns the input/select inside it.
 *
 * `scope` should be the specific review card (e.g. by summary text) so two
 * items with the same field label (two "create_calendar_event" items, say)
 * never collide.
 */
export function labeledField(page: Page, scope: Locator, label: string): Locator {
  return scope
    .locator("div.flex.flex-col.gap-1")
    .filter({ has: page.locator(`label:text-is("${label}")`) })
    .locator("input, select")
    .first();
}
