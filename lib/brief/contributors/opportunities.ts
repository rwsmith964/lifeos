// Module 8 (brief_registration_v2, D-1XX). Adapts Module 2's existing
// opportunities pipeline (D-061/D-070) into the generic BriefItem shape.
// Deliberately does not re-implement scoring, dedupe, or tiering -- it
// calls the same listOpenOpportunitiesWithSubjectForHousehold +
// getPresentedOpportunities the Opportunities page and Calendar nudge
// already use, so this contributor can never disagree with them about
// which opportunities stand out.
import { listOpenOpportunitiesWithSubjectForHousehold } from "../../db/repositories/opportunities";
import { getPresentedOpportunities } from "../../opportunities/present";
import type { BriefContributor, BriefItem } from "./types";

export const opportunitiesContributor: BriefContributor = async (ctx) => {
  const raw = await listOpenOpportunitiesWithSubjectForHousehold(ctx.supabase, ctx.householdId);
  const presented = getPresentedOpportunities(raw);

  return presented.flat.map((opp): BriefItem => ({
    id: `opportunities:${opp.id}`,
    category: "opportunities",
    // opp.score is already 0-100 and already the ranking signal the
    // presentation layer uses -- reuse it directly rather than inventing
    // a second priority scale that could rank differently from the
    // Opportunities page.
    priority: opp.score,
    leadTimeDays: 0,
    title: opp.headline,
    detail: opp.reasoning,
    href: "/opportunities",
  }));
};
