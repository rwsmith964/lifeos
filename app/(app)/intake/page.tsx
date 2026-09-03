// Module 3 — Universal Intake (universal_intake_v2, D-136). Direct-URL-only,
// no nav link yet -- same discoverability posture as /execution and
// /ambient (Module 5/6), left for a later nav pass (see QUEUE-024). The
// backend (app/api/intake/route.ts submission endpoint, lib/intake/review-queue.ts
// approve/reject/correct) already existed and was fully tested before this
// page; this file is only the missing submission + review-queue UI (D-136).
import { notFound } from "next/navigation";
import { requireHouseholdContext } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/flags";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { listActionableDraftsForHousehold, listRecentResolvedDraftsForHousehold } from "@/lib/db/repositories/intake";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { IntakeCaptureForm } from "./intake-capture-form";
import { IntakeReviewQueue } from "./intake-review-queue";

export const metadata = {
  title: "Add anything — LifeOS",
};

export default async function IntakePage() {
  const { supabase, household } = await requireHouseholdContext();

  const enabled = await isFeatureEnabled(supabase, household.id, "universal_intake_v2");
  if (!enabled) {
    notFound();
  }

  const [people, actionableDrafts, resolvedDrafts] = await Promise.all([
    listPeopleForHousehold(supabase, household.id),
    listActionableDraftsForHousehold(supabase, household.id),
    listRecentResolvedDraftsForHousehold(supabase, household.id),
  ]);

  const activePeople = people.filter((p) => !p.is_archived);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">Add anything</h1>
        <p className="text-sm text-muted-foreground">
          Paste a text, or upload a screenshot or photo — a flyer, a flight confirmation, a text thread. The
          assistant reads it and proposes what to add. Nothing is saved to your calendar, people, or gifts until
          you approve it below.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Submit something</CardTitle>
          <CardDescription>Text works best for now; photos and screenshots are read by AI and may need a closer look.</CardDescription>
        </CardHeader>
        <CardContent>
          <IntakeCaptureForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Waiting for review ({actionableDrafts.length})</CardTitle>
          <CardDescription>
            Approve to add it for real, or reject to discard it. Some record types need you to pick which
            household member they&apos;re about first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <IntakeReviewQueue drafts={actionableDrafts} people={activePeople} />
        </CardContent>
      </Card>

      {resolvedDrafts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recently reviewed</CardTitle>
          </CardHeader>
          <CardContent>
            <IntakeReviewQueue drafts={resolvedDrafts} people={activePeople} readOnly />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
