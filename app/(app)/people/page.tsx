import Link from "next/link";
import { Plus } from "lucide-react";
import { requireHouseholdContext } from "@/lib/auth/session";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { listChildcareRequestsForHousehold } from "@/lib/db/repositories/childcare";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChildcareSection } from "./childcare-section";

const RELATIONSHIP_LABELS: Record<string, string> = {
  self: "You",
  child: "Child",
  spouse: "Spouse",
  partner: "Partner",
  co_parent: "Co-parent",
  parent: "Parent",
  sibling: "Sibling",
  extended_family: "Extended family",
  friend: "Friend",
  colleague: "Colleague",
  other: "Other",
};

export default async function PeoplePage() {
  const { supabase, household } = await requireHouseholdContext();
  const [people, othersRaw, childcareRequests] = await Promise.all([
    listPeopleForHousehold(supabase, household.id),
    // P0-5: excludeSelf here is the canonical decision for "does the
    // account owner show up in the People list" -- no (self is who's
    // using the app, not someone they're keeping track of) -- applied via
    // the shared query rather than a page-local filter so every other
    // screen presenting this same roster (Add Event's attendee picker,
    // etc.) can share the exact same decision instead of each re-deriving
    // its own filter and silently drifting out of sync.
    listPeopleForHousehold(supabase, household.id, { excludeSelf: true }),
    listChildcareRequestsForHousehold(supabase, household.id),
  ]);
  const others = othersRaw
    // The repository query sorts by the DB column full_name, which isn't
    // always what's shown as the primary label below (nickname takes
    // priority when set) — re-sort here by the same name actually
    // displayed so the on-screen order always matches what the user sees
    // (Phase 3 backlog: "sort-by-hidden-field").
    .sort((a, b) => (a.nickname || a.full_name).localeCompare(b.nickname || b.full_name));

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">People</h1>
        <Button asChild size="sm">
          <Link href="/people/new">
            <Plus className="size-4" /> Add
          </Link>
        </Button>
      </div>

      {others.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            No one added yet. Add the people in your life to start getting gift reminders and contact
            nudges.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2 lg:grid lg:grid-cols-3 lg:gap-3">
          {others.map((person) => (
            <Link key={person.id} href={`/people/${person.id}`}>
              <Card>
                <CardContent className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{person.nickname || person.full_name}</p>
                    {/* Only show the full name as a subtitle when it's actually
                        different information than the title above — otherwise
                        this rendered the same name twice (Phase 3 backlog:
                        "double-name display"). */}
                    {person.nickname && person.nickname !== person.full_name && (
                      <p className="text-xs text-muted-foreground">{person.full_name}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="secondary">{RELATIONSHIP_LABELS[person.relationship_type] ?? person.relationship_type}</Badge>
                    {person.is_childcare_provider && <Badge variant="outline">Childcare provider</Badge>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <ChildcareSection requests={childcareRequests} people={people} />
    </div>
  );
}
