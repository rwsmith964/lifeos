# QUESTIONS.md

Questions that genuinely cannot be decided without Richard's input, per Section 1.4. Sorted by priority (HIGH, then MEDIUM, then LOW) within each pass. Deduplicated.

---

## HIGH

(none logged yet)

## MEDIUM

(none logged yet)

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
