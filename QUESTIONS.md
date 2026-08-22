# QUESTIONS.md

Questions that genuinely cannot be decided without Richard's input, per Section 1.4. Sorted by priority (HIGH, then MEDIUM, then LOW) within each pass. Deduplicated.

---

## HIGH

(none logged yet)

## MEDIUM

## Q-002 | weekend-planner / odfw | Priority: MEDIUM
**Question:** ODFW publishes recreation reports as web pages with no API (Section 9.3). The adapter (`lib/external/odfw.ts`) fetches and plain-text-extracts a configured zone URL, caches it once daily, and degrades to "no current fishing report available" on any fetch/parse failure. Do you want a manual override field where you can paste in a report you've read yourself (e.g. from a source the scraper can't reach, or when you've got better on-the-ground info than the last cached page)?
**Why it matters:** Directly affects whether the weekend planner ever shows a fishing-condition claim beyond what the scraper managed to fetch — a manual override changes the data model (a new field/table) and the planner's source-precedence logic (does a manual note override or supplement the scraped one, and for how long before it goes stale?).
**What I did meanwhile:** Built the scrape-only path. No override field exists yet; `getOdfwReport()` in `lib/external/odfw.ts` is the only source the weekend planner will read from ODFW.
**Options I see:**
  A) No override — scrape-only, exactly as built
  B) A simple `notes` text field per activity_location, always shown alongside (not replacing) the scraped report
  C) A dated manual override that supersedes the scraped report until it expires (e.g. 3 days), then falls back to scraping again
**My recommendation if forced:** B — simplest, keeps the scraped report as the source of truth, adds your read without new staleness logic to get wrong.

## LOW

## Q-001 | NAMING | Priority: LOW
**Question:** What should the product actually be called? UI copy currently uses the placeholder "LifeOS" everywhere, centralized in one constant.
**Why it matters:** Doesn't block any functionality — purely cosmetic. Centralized so it's a one-line change whenever you decide.
**What I did meanwhile:** Used `APP_NAME = "LifeOS"` in `lib/constants.ts`, referenced everywhere instead of hardcoded strings.
**Options I see:**
  A) Keep "LifeOS" as the real name
  B) Something spine/people-graph themed (e.g. "Kinfolk", "Nearby", "Circle")
  C) Something gift/occasion themed (e.g. "Occasion", "Nevermiss")
**My recommendation if forced:** A — it's descriptive and not embarrassing to ship with.
