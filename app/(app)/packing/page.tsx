// Packing checklist wizard index (packing_checklist_v2, D-139, roadmap R-2).
// Direct-URL-only, no nav link yet -- same discoverability posture as
// /intake, /execution, and /ambient (Module 3/5/6): a newly flagged module
// doesn't need a layout.tsx NAV_ITEMS change to be usable, and that's an
// accepted precedent in this codebase.
import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { requireHouseholdContext } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/lib/flags";
import { listPackingListsForHousehold } from "@/lib/db/repositories/packing";
import { TRIP_TYPE_LABELS } from "@/lib/ai/prompts/packing-checklist";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Packing lists — LifeOS",
};

export default async function PackingListsPage() {
  const { supabase, household } = await requireHouseholdContext();

  const enabled = await isFeatureEnabled(supabase, household.id, "packing_checklist_v2");
  if (!enabled) {
    notFound();
  }

  const packingLists = await listPackingListsForHousehold(supabase, household.id);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Packing lists</h1>
        <Button asChild size="sm">
          <Link href="/packing/new">New packing list</Link>
        </Button>
      </div>

      {packingLists.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No packing lists yet. Start one for your next trip and it&apos;ll ask a few quick questions to build a
            tailored checklist.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {packingLists.map((list) => (
            <Link key={list.id} href={`/packing/${list.id}`}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardHeader className="flex flex-row items-center justify-between gap-2 py-4">
                  <div>
                    <CardTitle className="text-base">{list.title}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {TRIP_TYPE_LABELS[list.trip_type]}
                      {list.destination ? ` · ${list.destination}` : ""}
                      {list.start_date
                        ? ` · ${format(new Date(`${list.start_date}T00:00:00`), "MMM d")}${
                            list.end_date ? `–${format(new Date(`${list.end_date}T00:00:00`), "MMM d")}` : ""
                          }`
                        : ""}
                    </p>
                  </div>
                  {list.status === "archived" && <Badge variant="secondary">Archived</Badge>}
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
