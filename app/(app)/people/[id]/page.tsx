import Link from "next/link";
import { notFound } from "next/navigation";
import { addDays, format } from "date-fns";
import { ArrowLeft, Mail, Pencil, Phone } from "lucide-react";
import { requireHouseholdContext } from "@/lib/auth/session";
import { peopleRepo } from "@/lib/db/repositories/people";
import {
  listInterestsForPerson,
  listBudgetsForPerson,
  listGiftSitesForPerson,
  listPeopleForHousehold,
} from "@/lib/db/repositories/people";
import { listWorkSchedulesForPerson, listTimeOffForPerson } from "@/lib/db/repositories/work-schedule";
import { listChildActivitiesForChild, listAttendanceForActivities } from "@/lib/db/repositories/child-activities";
import { listGiftsForPerson } from "@/lib/db/repositories/gifts";
import { getCadenceForPerson, listInteractionsForPerson } from "@/lib/db/repositories/contact";
import {
  listCustodyBlocksForChildInRange,
  listUpcomingEventsForPerson,
} from "@/lib/db/repositories/calendar";
import { evaluateCadence } from "@/lib/contact/cadence";
import { nearestUpcomingOccasionForPerson, occasionTypeDisplayLabel } from "@/lib/gifts/occasions";
import { estimateAgeYears } from "@/lib/ai/prompts/gift-suggestion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AddBudgetForm,
  AddGiftSiteForm,
  AddInterestForm,
  AddTimeOffForm,
  AddWorkScheduleForm,
  AddChildActivityForm,
  ChildActivityListItem,
  CadenceForm,
  DeleteBudgetButton,
  GiftHistoryItem,
  DeleteGiftSiteButton,
  DeleteInterestButton,
  DeleteTimeOffButton,
  DeleteWorkScheduleButton,
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
  const todayStr = format(now, "yyyy-MM-dd");
  // index = day_of_week (0 = Sunday .. 6 = Saturday) -- matches
  // work_schedules.day_of_week (see lib/calendar/work-schedule.ts).
  const DAY_OF_WEEK_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

  const [
    interests,
    budgets,
    giftSites,
    gifts,
    cadence,
    interactions,
    upcomingEvents,
    custodyBlocks,
    workSchedules,
    timeOffEntries,
    childActivities,
    householdAdults,
  ] = await Promise.all([
    listInterestsForPerson(supabase, id),
    listBudgetsForPerson(supabase, id),
    listGiftSitesForPerson(supabase, id),
    listGiftsForPerson(supabase, id, 10),
    getCadenceForPerson(supabase, id),
    listInteractionsForPerson(supabase, id, 5),
    listUpcomingEventsForPerson(supabase, id, now.toISOString(), 5),
    isChild
      ? listCustodyBlocksForChildInRange(supabase, id, now.toISOString(), new Date(now.getTime() + 14 * 86400000).toISOString())
      : Promise.resolve([]),
    listWorkSchedulesForPerson(supabase, id),
    listTimeOffForPerson(supabase, id),
    // D-129: activity infrastructure only applies to children -- skip the
    // fetch entirely for adults/self rather than fetch-and-discard.
    isChild ? listChildActivitiesForChild(supabase, id) : Promise.resolve([]),
    // Every other household adult (self + co-parent + any other adults) is
    // a candidate for the per-activity mandatory/optional attendance select
    // -- excludes children so a sibling never shows up as an "attendee".
    isChild
      ? listPeopleForHousehold(supabase, household.id).then((people) =>
          people.filter((p) => p.relationship_type !== "child")
        )
      : Promise.resolve([]),
  ]);

  const attendanceByActivity = isChild
    ? await listAttendanceForActivities(supabase, childActivities.map((a) => a.id))
    : new Map();

  // Only show time off that hasn't fully passed yet -- past entries stay
  // in the table (informational history, same as gift history below) but
  // clutter this card without adding value.
  const upcomingTimeOff = timeOffEntries.filter((entry) => entry.end_date >= todayStr);

  const responsiblePeople = new Map<string, string>();
  for (const block of custodyBlocks) {
    if (!responsiblePeople.has(block.responsible_person_id)) {
      const responsible = await peopleRepo.getById(supabase, block.responsible_person_id);
      if (responsible) responsiblePeople.set(block.responsible_person_id, responsible.full_name);
    }
  }

  const age = estimateAgeYears(person.birthdate, person.birth_year_known, new Date());
  const cadenceStatus = cadence ? evaluateCadence(cadence, new Date()) : null;

  // P1-9: default the "Get gift ideas" form to this person's actual
  // nearest upcoming occasion (birthday/anniversary/christmas) instead of
  // always defaulting to "just_because" + today.
  const nearestOccasion = nearestUpcomingOccasionForPerson(person, now);

  return (
    <div className="flex flex-col gap-4 p-4">
      <Link href="/people" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3" /> People
      </Link>

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

      {isChild && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Activities</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-muted-foreground text-xs">
              {person.full_name}&apos;s recurring weekly activities -- practices, lessons, anything on a regular
              schedule. Mark whether each adult has to be there (games) or it&apos;s optional (practices). This
              doesn&apos;t add anything to the calendar yet -- it&apos;s just where the schedule lives.
            </p>
            {childActivities.length > 0 && (
              <div className="flex flex-col gap-3">
                {childActivities.map((activity) => (
                  <ChildActivityListItem
                    key={activity.id}
                    childPersonId={id}
                    activity={activity}
                    householdAdults={householdAdults}
                    attendance={attendanceByActivity.get(activity.id) ?? []}
                  />
                ))}
              </div>
            )}
            <AddChildActivityForm childPersonId={id} />
          </CardContent>
        </Card>
      )}

      {!isChild && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Work schedule</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-muted-foreground text-xs">
              This person&apos;s usual weekly shifts. Used to figure out when they&apos;re free for plans and to skip
              generating a shift on any day they&apos;ve booked off below.
            </p>
            {workSchedules.length > 0 && (
              <div className="flex flex-col gap-1">
                {workSchedules.map((schedule) => (
                  <div key={schedule.id} className="flex items-center justify-between text-sm">
                    <p>
                      <span className="font-medium">{DAY_OF_WEEK_LABELS[schedule.day_of_week]}</span>{" "}
                      <span className="text-muted-foreground">
                        {schedule.label} {schedule.start_time}–{schedule.end_time}
                      </span>
                    </p>
                    <DeleteWorkScheduleButton personId={id} scheduleId={schedule.id} />
                  </div>
                ))}
              </div>
            )}
            <AddWorkScheduleForm personId={id} />
          </CardContent>
        </Card>
      )}

      {!isChild && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Time off</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-muted-foreground text-xs">
              Vacation, sick days, or anything else that takes this person off their usual work schedule. You can
              also add these by just describing them in Quick Capture -- e.g. “I’m off next Friday.”
            </p>
            {upcomingTimeOff.length > 0 && (
              <div className="flex flex-col gap-1">
                {upcomingTimeOff.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between text-sm">
                    <p>
                      <span className="font-medium">
                        {entry.start_date === entry.end_date
                          ? format(new Date(`${entry.start_date}T00:00:00`), "MMM d")
                          : `${format(new Date(`${entry.start_date}T00:00:00`), "MMM d")}–${format(new Date(`${entry.end_date}T00:00:00`), "MMM d")}`}
                      </span>{" "}
                      {entry.reason && <span className="text-muted-foreground">{entry.reason}</span>}
                      {entry.destination && <span className="text-muted-foreground"> — {entry.destination}</span>}
                    </p>
                    <DeleteTimeOffButton personId={id} entryId={entry.id} />
                  </div>
                ))}
              </div>
            )}
            <AddTimeOffForm personId={id} />
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
                  On track — last contact{" "}
                  {cadenceStatus.daysSinceLastContact === 0
                    ? "today"
                    : `${cadenceStatus.daysSinceLastContact} day${cadenceStatus.daysSinceLastContact === 1 ? "" : "s"} ago`}
                  .{" "}
                  {cadence?.last_contact_date &&
                    `Next check-in ${format(addDays(new Date(`${cadence.last_contact_date}T00:00:00`), cadence.target_interval_days), "MMM d")}.`}
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
                    <span className="font-medium">{occasionTypeDisplayLabel(budget.occasion_type)}:</span> $
                    {(budget.min_cents / 100).toFixed(0)}–${(budget.max_cents / 100).toFixed(0)}
                  </p>
                  <DeleteBudgetButton personId={id} budgetId={budget.id} />
                </div>
              ))}
            </div>
          )}
          <AddBudgetForm personId={id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Preferred gift sites</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-muted-foreground text-xs">
            Sites that have worked well for this person before. Once at least one is saved, gift suggestions
            link here instead of a generic Amazon search.
          </p>
          {giftSites.length > 0 && (
            <div className="flex flex-col gap-1">
              {giftSites.map((site) => (
                <div key={site.id} className="flex items-center justify-between text-sm">
                  <a
                    href={site.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate font-medium underline-offset-2 hover:underline"
                  >
                    {site.label}
                  </a>
                  <DeleteGiftSiteButton personId={id} siteId={site.id} />
                </div>
              ))}
            </div>
          )}
          <AddGiftSiteForm personId={id} />
        </CardContent>
      </Card>

      {person.relationship_type !== "self" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Get gift ideas</CardTitle>
          </CardHeader>
          <CardContent>
            <GenerateSuggestionsForm
              personId={id}
              defaultOccasionType={nearestOccasion?.occasionType ?? "just_because"}
              defaultOccasionDate={nearestOccasion ? format(nearestOccasion.occasionDate, "yyyy-MM-dd") : todayStr}
            />
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
                <GiftHistoryItem key={gift.id} personId={id} gift={gift} />
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
