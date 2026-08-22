import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Mail, Pencil, Phone } from "lucide-react";
import { requireHouseholdContext } from "@/lib/auth/session";
import { peopleRepo } from "@/lib/db/repositories/people";
import { listInterestsForPerson, listBudgetsForPerson } from "@/lib/db/repositories/people";
import { listGiftsForPerson } from "@/lib/db/repositories/gifts";
import { getCadenceForPerson, listInteractionsForPerson } from "@/lib/db/repositories/contact";
import {
  listCustodyBlocksForChildInRange,
  listUpcomingEventsForPerson,
} from "@/lib/db/repositories/calendar";
import { evaluateCadence } from "@/lib/contact/cadence";
import { estimateAgeYears } from "@/lib/ai/prompts/gift-suggestion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AddBudgetForm,
  AddInterestForm,
  CadenceForm,
  DeleteBudgetButton,
  DeleteGiftButton,
  DeleteInterestButton,
  GenerateSuggestionsForm,
  LogInteractionButton,
  RecordGiftForm,
} from "./person-forms";

export default async function PersonDetailPage({ params }: PageProps<"/people/[id]">) {
  const { id } = await params;
  const { supabase, household } = await requireHouseholdContext();

  const person = await peopleRepo.getById(supabase, id);
  if (!person || person.household_id !== household.id) notFound();

  const now = new Date();
  const isChild = person.relationship_type === "child";

  const [interests, budgets, gifts, cadence, interactions, upcomingEvents, custodyBlocks] = await Promise.all([
    listInterestsForPerson(supabase, id),
    listBudgetsForPerson(supabase, id),
    listGiftsForPerson(supabase, id, 10),
    getCadenceForPerson(supabase, id),
    listInteractionsForPerson(supabase, id, 5),
    listUpcomingEventsForPerson(supabase, id, now.toISOString(), 5),
    isChild
      ? listCustodyBlocksForChildInRange(supabase, id, now.toISOString(), new Date(now.getTime() + 14 * 86400000).toISOString())
      : Promise.resolve([]),
  ]);

  const responsiblePeople = new Map<string, string>();
  for (const block of custodyBlocks) {
    if (!responsiblePeople.has(block.responsible_person_id)) {
      const responsible = await peopleRepo.getById(supabase, block.responsible_person_id);
      if (responsible) responsiblePeople.set(block.responsible_person_id, responsible.full_name);
    }
  }

  const age = estimateAgeYears(person.birthdate, person.birth_year_known, new Date());
  const cadenceStatus = cadence ? evaluateCadence(cadence, new Date()) : null;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{person.full_name}</h1>
          <p className="text-sm text-muted-foreground">
            {person.relationship_type.replace("_", " ")}
            {age != null && ` · ${age} years old`}
            {person.birthdate && ` · born ${format(new Date(person.birthdate), "MMMM d")}`}
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href={`/people/${id}/edit`}>
            <Pencil className="size-4" /> Edit
          </Link>
        </Button>
      </div>

      {(person.phone || person.email) && (
        <Card>
          <CardContent className="flex flex-col gap-2">
            {person.phone && (
              <a href={`tel:${person.phone}`} className="flex items-center gap-2 text-sm">
                <Phone className="size-4 text-muted-foreground" /> {person.phone}
              </a>
            )}
            {person.email && (
              <a href={`mailto:${person.email}`} className="flex items-center gap-2 text-sm">
                <Mail className="size-4 text-muted-foreground" /> {person.email}
              </a>
            )}
          </CardContent>
        </Card>
      )}

      {upcomingEvents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Upcoming</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {upcomingEvents.map((event) => (
              <div key={event.id} className="flex items-center justify-between text-sm">
                <p className="font-medium">{event.title}</p>
                <p className="text-xs text-muted-foreground">
                  {event.all_day ? format(new Date(event.starts_at), "MMM d") : format(new Date(event.starts_at), "MMM d, h:mm a")}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {isChild && custodyBlocks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Custody (next 14 days)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {custodyBlocks.map((block) => (
              <div key={block.id} className="flex items-center justify-between text-sm">
                <p>
                  <span className="font-medium">{responsiblePeople.get(block.responsible_person_id) ?? "Unknown"}</span>{" "}
                  <span className="text-muted-foreground">({block.block_type})</span>
                </p>
                <p className="text-xs text-muted-foreground">{format(new Date(block.starts_at), "EEE, MMM d, h:mm a")}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {person.relationship_type !== "self" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Contact cadence</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {cadenceStatus ? (
              cadenceStatus.isOverdue ? (
                <span className="text-sm text-destructive">
                  Overdue —{" "}
                  {cadenceStatus.daysSinceLastContact != null
                    ? `${cadenceStatus.daysSinceLastContact} days since last contact`
                    : "no contact on record"}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">
                  In touch — {cadenceStatus.daysSinceLastContact} days since last contact
                </span>
              )
            ) : (
              <span className="text-sm text-muted-foreground">No cadence tracked yet.</span>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <CadenceForm personId={id} currentDays={cadence?.target_interval_days ?? null} />
              <LogInteractionButton personId={id} />
            </div>
            {interactions.length > 0 && (
              <div className="flex flex-col gap-1 border-t pt-2">
                {interactions.map((interaction) => (
                  <div key={interaction.id} className="text-xs">
                    <span className="font-medium text-foreground">
                      {format(new Date(interaction.occurred_on), "MMM d")}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {interaction.interaction_type.replace("_", " ")}
                      {interaction.notes && ` — ${interaction.notes}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Interests</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {interests.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {interests.map((interest) => (
                <Badge key={interest.id} variant={interest.strength === "passionate" ? "default" : "secondary"}>
                  {interest.interest}
                  <DeleteInterestButton personId={id} interestId={interest.id} />
                </Badge>
              ))}
            </div>
          )}
          <AddInterestForm personId={id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Gift budgets</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {budgets.length > 0 && (
            <div className="flex flex-col gap-1">
              {budgets.map((budget) => (
                <div key={budget.id} className="flex items-center justify-between text-sm">
                  <p>
                    <span className="font-medium">{budget.occasion_type}:</span> ${(budget.min_cents / 100).toFixed(0)}
                    –${(budget.max_cents / 100).toFixed(0)}
                  </p>
                  <DeleteBudgetButton personId={id} budgetId={budget.id} />
                </div>
              ))}
            </div>
          )}
          <AddBudgetForm personId={id} />
        </CardContent>
      </Card>

      {person.relationship_type !== "self" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Get gift ideas</CardTitle>
          </CardHeader>
          <CardContent>
            <GenerateSuggestionsForm personId={id} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Gift history</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {gifts.length > 0 && (
            <div className="flex flex-col gap-2">
              {gifts.map((gift) => (
                <div key={gift.id} className="flex items-start justify-between gap-2 text-sm">
                  <div>
                    <p className="font-medium">{gift.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {gift.occasion_type} · {gift.occasion_date}
                      {gift.reaction && ` · ${gift.reaction.replace("_", " ")}`}
                    </p>
                  </div>
                  <DeleteGiftButton personId={id} giftId={gift.id} />
                </div>
              ))}
            </div>
          )}
          <RecordGiftForm personId={id} />
        </CardContent>
      </Card>

      {person.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{person.notes}</CardContent>
        </Card>
      )}
    </div>
  );
}
