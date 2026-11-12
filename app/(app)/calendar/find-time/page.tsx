import Link from "next/link";
import { format } from "date-fns";
import { requireHouseholdContext } from "@/lib/auth/session";
import { getZonedNow } from "@/lib/timezones";
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { findTimeWith, type FindTimeOption, type FindTimeResult } from "@/lib/scheduling/find-time-server";
import { Breadcrumb } from "@/components/nav/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata = {
  title: "Find a time — Famwise",
};

function sourceNote(result: FindTimeResult): string {
  switch (result.source) {
    case "household":
      return `Based on both your calendars.`;
    case "shared":
      return `Based on your calendar and the busy times ${result.person.name} shares with you.`;
    case "not_shared":
      return `${result.person.name} is connected but hasn't shared when they're busy, so these are the times YOU are free. Send them an invite to confirm.`;
    default:
      return `${result.person.name} isn't connected, so these are the times YOU are free. Send them an invite to confirm. You can connect in Settings to see their free time too.`;
  }
}

function kidsNote(option: FindTimeOption, personName: string): string {
  const parts: string[] = [];
  parts.push(option.youHaveKids ? "You have the kids then, so you'd bring them along." : "You don't have the kids then.");
  if (option.theyHaveKids === true) parts.push(`${personName} has their kids then.`);
  if (option.theyHaveKids === false) parts.push(`${personName} doesn't have their kids.`);
  return parts.join(" ");
}

export default async function FindTimePage({ searchParams }: { searchParams: Promise<{ with?: string; activity?: string }> }) {
  const { with: withId, activity } = await searchParams;
  const { supabase, household, selfPerson, timezone } = await requireHouseholdContext();
  const people = (await listPeopleForHousehold(supabase, household.id)).filter((p) => !p.is_archived && p.id !== selfPerson.id);
  const other = withId ? people.find((p) => p.id === withId) : undefined;
  const activityText = (activity ?? "").trim();

  let result: FindTimeResult | null = null;
  let failed = false;
  if (other && activityText) {
    try {
      result = await findTimeWith(supabase, {
        householdId: household.id,
        selfPerson,
        other,
        activity: activityText,
        now: getZonedNow(timezone),
      });
    } catch (error) {
      console.error("Find a time failed:", error);
      failed = true;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb items={[{ label: "Calendar", href: "/calendar" }, { label: "Find a time" }]} />
      <div>
        <h1 className="font-display text-xl font-semibold">Find a time together</h1>
        <p className="font-sans text-body text-ink-2">
          Pick who and what, and I&apos;ll look for times you&apos;re both free, and say whether you&apos;d have the kids.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="with">With</Label>
          <select id="with" name="with" defaultValue={other?.id ?? ""} className="border-input h-9 rounded-md border bg-transparent px-3 text-sm" required>
            <option value="" disabled>
              Choose someone…
            </option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nickname || p.full_name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-[200px] flex-1 flex-col gap-2">
          <Label htmlFor="activity">To do what</Label>
          <Input id="activity" name="activity" defaultValue={activityText} placeholder="e.g. go fishing" required />
        </div>
        <Button type="submit">Find times</Button>
      </form>

      {failed && <p className="text-sm text-destructive">Couldn&apos;t look that up right now. Please try again.</p>}

      {result && (
        <div className="flex flex-col gap-3">
          <p className="font-sans text-metadata text-meta">{sourceNote(result)}</p>
          {result.places.length > 0 && (
            <p className="font-sans text-body text-ink-2">
              Places you could go for {result.activity}: {result.places.map((p) => p.location).join(" or ")}.
            </p>
          )}
          {result.options.length === 0 ? (
            <Card>
              <CardContent className="font-sans text-body text-ink-2">
                I couldn&apos;t find a {Math.round(result.durationMinutes / 60)}-hour stretch in the next three weeks when you&apos;re both free.
              </CardContent>
            </Card>
          ) : (
            <ul className="flex flex-col gap-2">
              {result.options.map((o) => {
                const href = `/calendar/new?${new URLSearchParams({
                  date: format(o.start, "yyyy-MM-dd"),
                  start: format(o.start, "HH:mm"),
                  end: format(o.end, "HH:mm"),
                  title: `${result.activity.replace(/^./, (c) => c.toUpperCase())} with ${result.person.name}`,
                  with: result.person.id,
                }).toString()}`;
                return (
                  <li key={o.start.toISOString()}>
                    <Card>
                      <CardContent className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-sans text-body font-bold text-ink">
                            {format(o.start, "EEEE, MMM d")} · {format(o.start, "h:mm a")}–{format(o.end, "h:mm a")}
                            {o.weekend ? "" : " (weekday)"}
                          </p>
                          <p className="font-sans text-metadata text-meta">{kidsNote(o, result.person.name)}</p>
                        </div>
                        <Button asChild size="sm">
                          <Link href={href}>Plan this &amp; invite {result.person.name}</Link>
                        </Button>
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
