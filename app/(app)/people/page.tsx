import { format } from "date-fns";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireHouseholdContext } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { getZonedNow } from "@/lib/timezones";
import { listPeopleForHousehold, listInterestsForPerson } from "@/lib/db/repositories/people";
import { listChildcareRequestsForHousehold } from "@/lib/db/repositories/childcare";
import { listActiveCadencesForHousehold } from "@/lib/db/repositories/contact";
import { listUpcomingEventsForPerson } from "@/lib/db/repositories/calendar";
import { listActiveSuggestionsForHousehold } from "@/lib/db/repositories/gifts";
import { evaluateRhythm, lastContactLabel } from "@/lib/people/rhythm";
import { nearestUpcomingOccasionForPerson, occasionTypeDisplayLabel } from "@/lib/gifts/occasions";
import { differenceInCalendarDays } from "date-fns";
import { ChildcareSection } from "./childcare-section";
import { PeopleTableClient, type PersonTableRow } from "./people-table-client";

const NEXT_THING_OCCASION_HORIZON_DAYS = 60;

export default async function PeoplePage() {
  const { supabase, household, timezone } = await requireHouseholdContext();
  const today = getZonedNow(timezone);

  const [people, cadences, childcareRequests, activeSuggestions] = await Promise.all([
    listPeopleForHousehold(supabase, household.id, { excludeSelf: true, includeArchived: true }),
    listActiveCadencesForHousehold(supabase, household.id),
    listChildcareRequestsForHousehold(supabase, household.id),
    listActiveSuggestionsForHousehold(supabase, household.id),
  ]);
  const allPeopleForChildcare = await listPeopleForHousehold(supabase, household.id, { includeArchived: true });

  const cadenceByPersonId = new Map(cadences.map((c) => [c.person_id, c]));
  const suggestionsByPersonId = new Map<string, typeof activeSuggestions>();
  for (const s of activeSuggestions) {
    const list = suggestionsByPersonId.get(s.person_id) ?? [];
    list.push(s);
    suggestionsByPersonId.set(s.person_id, list);
  }

  const rows: PersonTableRow[] = await Promise.all(
    people
      .filter((p) => !p.is_archived)
      .map(async (person): Promise<PersonTableRow> => {
        const cadence = cadenceByPersonId.get(person.id);
        const rhythm = cadence ? evaluateRhythm(cadence, today) : null;
        const lastContact = cadence ? lastContactLabel(cadence.last_contact_date, cadence.last_contact_type) : "No cadence set";

        const upcomingEvents = await listUpcomingEventsForPerson(supabase, person.id, today.toISOString(), 1);
        let nextThing = "—";
        if (upcomingEvents[0]) {
          nextThing = `${format(new Date(upcomingEvents[0].starts_at), "EEE, h:mm a")} · ${upcomingEvents[0].title}`;
        } else {
          const occasion = nearestUpcomingOccasionForPerson(person, today);
          if (occasion && differenceInCalendarDays(occasion.occasionDate, today) <= NEXT_THING_OCCASION_HORIZON_DAYS) {
            nextThing = `${occasionTypeDisplayLabel(occasion.occasionType)} ${format(occasion.occasionDate, "MMM d")}`;
          }
        }

        const [interests, giftSuggestions] = await Promise.all([
          listInterestsForPerson(supabase, person.id),
          Promise.resolve(suggestionsByPersonId.get(person.id) ?? []),
        ]);

        return {
          id: person.id,
          name: person.nickname || person.full_name,
          fullName: person.full_name,
          relationshipType: person.relationship_type,
          isChildcareProvider: person.is_childcare_provider,
          rhythmLabel: rhythm?.label ?? "No cadence set",
          rhythmTier: rhythm?.tier ?? "settled",
          rhythmHealthPct: rhythm?.healthPct ?? 100,
          hasCadence: !!cadence,
          lastContact,
          nextThing,
          phone: person.phone,
          notes: person.notes,
          interests: interests.map((i) => i.interest),
          giftShortlist: giftSuggestions.slice(0, 3).map((g) => ({
            id: g.id,
            title: g.title,
            priceCents: g.estimated_cost_cents,
            status: g.status,
          })),
        };
      })
  );

  const archivedRows: PersonTableRow[] = people
    .filter((p) => p.is_archived)
    .map((person) => ({
      id: person.id,
      name: person.nickname || person.full_name,
      fullName: person.full_name,
      relationshipType: person.relationship_type,
      isChildcareProvider: person.is_childcare_provider,
      rhythmLabel: "Archived",
      rhythmTier: "settled",
      rhythmHealthPct: 100,
      hasCadence: false,
      lastContact: "—",
      nextThing: "—",
      phone: person.phone,
      notes: person.notes,
      interests: [],
      giftShortlist: [],
    }));

  const slippingCount = rows.filter((r) => r.rhythmTier === "slipping").length;

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-page-title text-ink">People</h1>
          <p className="mt-1 font-sans text-body text-ink-2">
            {rows.length} in your circle{slippingCount > 0 && ` · ${slippingCount} slipping`}
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/people/new">
            <Plus className="size-4" /> Add
          </Link>
        </Button>
      </div>

      <PeopleTableClient rows={rows} archivedRows={archivedRows} />

      <ChildcareSection requests={childcareRequests} people={allPeopleForChildcare} />
    </div>
  );
}
