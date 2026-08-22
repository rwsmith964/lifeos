import { notFound } from "next/navigation";
import { format } from "date-fns";
import { requireHouseholdContext } from "@/lib/auth/session";
import { peopleRepo } from "@/lib/db/repositories/people";
import { listInterestsForPerson, listBudgetsForPerson } from "@/lib/db/repositories/people";
import { listGiftsForPerson } from "@/lib/db/repositories/gifts";
import { getCadenceForPerson } from "@/lib/db/repositories/contact";
import { evaluateCadence } from "@/lib/contact/cadence";
import { estimateAgeYears } from "@/lib/ai/prompts/gift-suggestion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function PersonDetailPage({ params }: PageProps<"/people/[id]">) {
  const { id } = await params;
  const { supabase, household } = await requireHouseholdContext();

  const person = await peopleRepo.getById(supabase, id);
  if (!person || person.household_id !== household.id) notFound();

  const [interests, budgets, gifts, cadence] = await Promise.all([
    listInterestsForPerson(supabase, id),
    listBudgetsForPerson(supabase, id),
    listGiftsForPerson(supabase, id, 10),
    getCadenceForPerson(supabase, id),
  ]);

  const age = estimateAgeYears(person.birthdate, person.birth_year_known, new Date());
  const cadenceStatus = cadence ? evaluateCadence(cadence, new Date()) : null;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">{person.full_name}</h1>
        <p className="text-sm text-muted-foreground">
          {person.relationship_type.replace("_", " ")}
          {age != null && ` · ${age} years old`}
          {person.birthdate && ` · born ${format(new Date(person.birthdate), "MMMM d")}`}
        </p>
      </div>

      {cadenceStatus && (
        <Card>
          <CardContent className="text-sm">
            {cadenceStatus.isOverdue ? (
              <span className="text-destructive">
                Overdue —{" "}
                {cadenceStatus.daysSinceLastContact != null
                  ? `${cadenceStatus.daysSinceLastContact} days since last contact`
                  : "no contact on record"}
              </span>
            ) : (
              <span className="text-muted-foreground">
                In touch — {cadenceStatus.daysSinceLastContact} days since last contact
              </span>
            )}
          </CardContent>
        </Card>
      )}

      {interests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Interests</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {interests.map((interest) => (
              <Badge key={interest.id} variant={interest.strength === "passionate" ? "default" : "secondary"}>
                {interest.interest}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      {budgets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Gift budgets</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {budgets.map((budget) => (
              <p key={budget.id} className="text-sm">
                <span className="font-medium">{budget.occasion_type}:</span> ${(budget.min_cents / 100).toFixed(0)}–$
                {(budget.max_cents / 100).toFixed(0)}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {gifts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Gift history</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {gifts.map((gift) => (
              <div key={gift.id} className="text-sm">
                <p className="font-medium">{gift.description}</p>
                <p className="text-xs text-muted-foreground">
                  {gift.occasion_type} · {gift.occasion_date}
                  {gift.reaction && ` · ${gift.reaction.replace("_", " ")}`}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

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
