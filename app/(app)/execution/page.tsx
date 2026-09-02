// Module 6 — Execution (draft-only in v1) (D-122, execution_draft_only
// flag). Direct-URL-only, no nav link — same pattern as /ambient
// (Module 5): a new route is additive to the app; whether it's
// *discoverable* yet is a separate decision left for Module 8 (Brief
// Integration) or a later nav pass. See QUEUE-024.
//
// Read the module header comments in lib/execution/generate-draft.ts and
// lib/execution/assistant-address.ts before touching this page — they
// carry the brief's two hard requirements (default-excluded category
// allowlist, and the un-overridable colleague exclusion) that this page
// only *displays*; the actual enforcement lives in that library, not here.
import { notFound } from "next/navigation";
import { requireHouseholdContext } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/flags";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import {
  listContactExecutionSettingsForHousehold,
  listExecutionCategoriesForHousehold,
  listPendingExecutionDrafts,
  listReviewedExecutionDrafts,
  resolveCategoryEnabled,
} from "@/lib/db/repositories/execution";
import { getAssistantEmailConfig } from "@/lib/db/repositories/execution";
import { assistantEmailAddress } from "@/lib/execution/assistant-address";
import type { ExecutionCategory } from "@/lib/db/database.types";
import { EXECUTION_CATEGORIES } from "@/lib/execution/labels";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CategoryAllowlist } from "./category-allowlist";
import { AssistantAddressCard } from "./assistant-address-card";
import { ContactExclusionList } from "./contact-exclusion-list";
import { NewDraftForm } from "./new-draft-form";
import { DraftReviewQueue } from "./draft-review-queue";

export const metadata = {
  title: "Execution (draft-only) — LifeOS",
};

export default async function ExecutionPage() {
  const { supabase, household, memberships } = await requireHouseholdContext();

  const enabled = await isFeatureEnabled(supabase, household.id, "execution_draft_only");
  if (!enabled) {
    notFound();
  }

  const selfMembership = memberships.find((m) => m.household.id === household.id);
  const canManage = selfMembership?.role === "owner" || selfMembership?.role === "adult";

  const [people, categoryRows, contactSettings, pendingDrafts, reviewedDrafts, assistantConfig] = await Promise.all([
    listPeopleForHousehold(supabase, household.id),
    listExecutionCategoriesForHousehold(supabase, household.id),
    listContactExecutionSettingsForHousehold(supabase, household.id),
    listPendingExecutionDrafts(supabase, household.id),
    listReviewedExecutionDrafts(supabase, household.id),
    getAssistantEmailConfig(supabase, household.id),
  ]);

  const categoryEnabled: Record<ExecutionCategory, boolean> = {
    rsvp: resolveCategoryEnabled(categoryRows, "rsvp"),
    reschedule: resolveCategoryEnabled(categoryRows, "reschedule"),
    confirmation: resolveCategoryEnabled(categoryRows, "confirmation"),
    gift_order: resolveCategoryEnabled(categoryRows, "gift_order"),
  };

  // Exclude "self" — this is about drafting to other people, not to
  // yourself — the same person-list convention Settings uses (P0-5).
  const contactablePeople = people.filter((p) => p.relationship_type !== "self" && !p.is_archived);
  const enabledCategoryList = EXECUTION_CATEGORIES.filter((c) => categoryEnabled[c]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">Execution (draft-only)</h1>
        <p className="text-sm text-muted-foreground">
          The assistant can prepare replies for you to review — it never sends anything on its own. Every draft
          below sits in a queue until a household member approves or discards it.
        </p>
      </div>

      <AssistantAddressCard
        address={assistantConfig ? assistantEmailAddress(assistantConfig) : null}
        canManage={canManage}
      />

      <Card>
        <CardHeader>
          <CardTitle>What the assistant is allowed to draft</CardTitle>
          <CardDescription>
            Nothing is enabled by default. Turn on only the categories you want draft suggestions for.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CategoryAllowlist categoryEnabled={categoryEnabled} canManage={canManage} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>People the assistant never drafts for</CardTitle>
          <CardDescription>
            Colleagues are always excluded and can&apos;t be re-enabled here. Mark anyone else as a business or
            client contact to exclude them too.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ContactExclusionList people={contactablePeople} contactSettings={contactSettings} canManage={canManage} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>New draft</CardTitle>
          <CardDescription>
            {enabledCategoryList.length === 0
              ? "Turn on at least one category above before creating a draft."
              : "Drafts are saved for review only — nothing is sent."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewDraftForm
            people={contactablePeople}
            contactSettings={contactSettings}
            enabledCategories={enabledCategoryList}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Waiting for review ({pendingDrafts.length})</CardTitle>
          <CardDescription>Approve to mark a draft as ready to send yourself, or discard it.</CardDescription>
        </CardHeader>
        <CardContent>
          <DraftReviewQueue drafts={pendingDrafts} people={people} />
        </CardContent>
      </Card>

      {reviewedDrafts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recently reviewed</CardTitle>
          </CardHeader>
          <CardContent>
            <DraftReviewQueue drafts={reviewedDrafts} people={people} readOnly />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
