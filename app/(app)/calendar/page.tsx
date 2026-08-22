import Link from "next/link";
import { Plus } from "lucide-react";
import { addDays, format, startOfDay } from "date-fns";
import { requireHouseholdContext } from "@/lib/auth/session";
import { listCustodyBlocksForHouseholdInRange, listEventsInRange } from "@/lib/db/repositories/calendar";
import { getWeekendPlanForDate } from "@/lib/db/repositories/system";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteCalendarItemButton } from "./delete-item-button";
import { GenerateWeekendPlanButton } from "./generate-weekend-plan-button";

// Section 12.11 / 12.12: mobile-first single column favors an agenda list
// over a month grid — a full calendar-grid component is a reasonable v1
// simplification given the spec doesn't prescribe a specific calendar
// widget, just "UI — Calendar / planner screens."
const LOOKAHEAD_DAYS = 14;

export default async function CalendarPage() {
  const { supabase, household } = await requireHouseholdContext();
  const start = startOfDay(new Date());
  const end = addDays(start, LOOKAHEAD_DAYS);

  const [events, custodyBlocks] = await Promise.all([
    listEventsInRange(supabase, household.id, start.toISOString(), end.toISOString()),
    listCustodyBlocksForHouseholdInRange(supabase, household.id, start.toISOString(), end.toISOString()),
  ]);

  const items = [
    ...events.map((e) => ({
      id: e.id,
      kind: "event" as const,
      startsAt: new Date(e.starts_at),
      title: e.title,
      subtitle: e.event_type,
      allDay: e.all_day,
    })),
    ...custodyBlocks.map((c) => ({
      id: c.id,
      kind: "custody" as const,
      startsAt: new Date(c.starts_at),
      title: `Custody: ${c.block_type}`,
      subtitle: "custody",
      allDay: false,
    })),
  ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const byDay = new Map<string, typeof items>();
  for (const item of items) {
    const key = format(item.startsAt, "yyyy-MM-dd");
    byDay.set(key, [...(byDay.get(key) ?? []), item]);
  }

  const daysUntilSaturday = (6 - start.getDay() + 7) % 7;
  const upcomingSaturday = format(addDays(start, daysUntilSaturday === 0 ? 7 : daysUntilSaturday), "yyyy-MM-dd");
  const weekendPlan = await getWeekendPlanForDate(supabase, household.id, upcomingSaturday);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Next {LOOKAHEAD_DAYS} days</h1>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/calendar/custody/new">Custody</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/calendar/new">
              <Plus className="size-4" /> Add
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">This weekend ({format(new Date(upcomingSaturday), "MMM d")})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {weekendPlan ? (
            <div className="whitespace-pre-line text-sm text-muted-foreground">{weekendPlan.content_markdown}</div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">No plan generated yet.</p>
              <GenerateWeekendPlanButton />
            </>
          )}
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">Nothing scheduled.</CardContent>
        </Card>
      ) : (
        Array.from(byDay.entries()).map(([day, dayItems]) => (
          <div key={day} className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">{format(new Date(day), "EEEE, MMM d")}</p>
            {dayItems.map((item) => (
              <Card key={item.id}>
                <CardContent className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.allDay ? "All day" : format(item.startsAt, "h:mm a")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{item.subtitle}</Badge>
                    <DeleteCalendarItemButton id={item.id} kind={item.kind} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
