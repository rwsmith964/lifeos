// Brain dump page (D-066, extended P3-7). Reached from a link inside the
// Quick Capture panel (components/capture/capture-button.tsx) —
// deliberately not a bottom-nav item, since the nav is capped at exactly
// 6 (reaffirmed D-064). Server component resolves the household's people
// once for the client review UI's person selects, and now also its recent
// brain_dump_batches so the history/re-run list has something to show on
// first load; all the recording/parsing/review interaction lives in
// BrainDumpClient.
import { requireHouseholdContext } from "@/lib/auth/session";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { listRecentBrainDumpBatches } from "@/lib/db/repositories/brain-dump";
import { BrainDumpClient } from "./brain-dump-client";

export default async function BrainDumpPage() {
  const { supabase, household } = await requireHouseholdContext();
  const [people, batches] = await Promise.all([
    listPeopleForHousehold(supabase, household.id),
    listRecentBrainDumpBatches(supabase, household.id),
  ]);

  const options = people.map((p) => ({
    id: p.id,
    label: p.nickname || p.full_name,
  }));

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">Brain dump</h1>
        <p className="text-sm text-muted-foreground">
          Record or type a long, rambling note — several things at once is fine. I&apos;ll split it into individual
          items you can review, edit, and save.
        </p>
      </div>
      <BrainDumpClient people={options} initialBatches={batches} />
    </div>
  );
}
