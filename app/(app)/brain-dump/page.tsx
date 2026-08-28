// Brain dump page (D-066). Reached from a link inside the Quick Capture
// panel (components/capture/capture-button.tsx) — deliberately not a
// bottom-nav item, since the nav is capped at exactly 6 (reaffirmed
// D-064). Server component just resolves the household's people once for
// the client review UI's person selects; all the recording/parsing/review
// interaction lives in BrainDumpClient.
import { requireHouseholdContext } from "@/lib/auth/session";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { BrainDumpClient } from "./brain-dump-client";

export default async function BrainDumpPage() {
  const { supabase, household } = await requireHouseholdContext();
  const people = await listPeopleForHousehold(supabase, household.id);

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
      <BrainDumpClient people={options} />
    </div>
  );
}
