// Module 8 (brief_registration_v2, D-1XX). The one list every module's
// brief contribution is registered in. Adding a ninth module's brief
// surface means adding one entry here (and its own contributor file) --
// nothing in compose.ts or the page that renders the brief needs to know
// this list grew.
//
// The pre-Module-8 AI-generated sections (today/heads up/people/
// suggestion/weather, lib/brief/generate.ts + schema.ts) are deliberately
// NOT wrapped into a contributor here yet -- seen at the call site
// (app/(app)/page.tsx) as a documented, logged scope decision (QUEUE-031)
// rather than silently left out. Retrofitting the AI schema would mean the
// AI's own structured output competing with this file's compose/cap step
// for content it currently owns outright, which is a materially bigger and
// riskier change than what shipping Module 8 on schedule calls for.
import type { BriefContributor } from "./types";
import { opportunitiesContributor } from "./opportunities";
import { householdContributor } from "./household";

export const BRIEF_CONTRIBUTORS: BriefContributor[] = [opportunitiesContributor, householdContributor];

export type { BriefCategory, BriefContributorContext, BriefItem } from "./types";
export { composeBrief, itemsForCategory, DEFAULT_CATEGORY_CAPS } from "./compose";
