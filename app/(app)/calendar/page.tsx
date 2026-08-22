import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parse,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { requireHouseholdContext } from "@/lib/auth/session";
import {
  listAttendeeNamesForEvents,
  listCustodyBlocksForHouseholdInRange,
  listEventsInRange,
} from "@/lib/db/repositories/calendar";
import { getWeekendPlanForDate } from "@/lib/db/repositories/system";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DeleteCalendarItemButton } from "./delete-item-button";
import { GenerateWeekendPlanButton } from "./generate-weekend-plan-button";

const MONTH_PARAM_FORMAT = "yyyy-MM";
const DAY_PARAM_FORMAT = "yyyy-MM-dd";
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function parseMonthParam(raw: string | undefined): Date {
  if (!raw) return startOfMonth(new Date());
  const parsed = parse(raw, MONTH_PARAM_FORMAT, new Date());
  return Number.isNaN(parsed.getTime()) ? startOfMonth(new Date()) : startOfMonth(parsed);
}

function parseDayParam(raw: string | undefined, monthDate: Date): Date {
  if (raw) {
    const parsed = parse(raw, DAY_PARAM_FORMAT, new Date());
    if (!Number.isNaN(parsed.getTime())) return startOfDay(parsed);
  }
  const today = startOfDay(new Date());
  return isSameMonth(today, monthDate) ? today : startOfMonth(monthDate);
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; day?: string }>;
}) {
  const { month: monthParam, day: dayParam } = await searchParams;
  const { supabase, household } = await requireHouseholdContext();

  const monthDate = parseMonthParam(monthParam);
  const selectedDay = parseDayParam(dayParam, monthDate);
  const monthLabel = format(monthDate, MONTH_PARAM_FORMAT);

  const gridStart = startOfWeek(startOfMonth(monthDate));
  const gridEnd = endOfWeek(endOfMonth(monthDate));
  const gridDays = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const [events, custodyBlocks] = await Promise.all([
    listEventsInRange(supabase, household.id, gridStart.toISOString(), gridEnd.toISOString()),
    listCustodyBlocksForHouseholdInRange(supabase, household.id, gridStart.toISOString(), gridEnd.toISOString()),
  ]);
  const attendeesByEvent = await listAttendeeNamesForEvents(
    supabase,
    events.map((e) => e.id)
  );

  const items = [
    ...events.map((e) => ({
      id: e.id,
      kind: "event" as const,
      startsAt: new Date(e.starts_at),
      title: e.title,
      subtitle: e.event_type,
      allDay: e.all_day,
      attendees: attendeesByEvent.get(e.id) ?? [],
    })),
    ...custodyBlocks.map((c) => ({
      id: c.id,
      kind: "custody" as const,
      startsAt: new Date(c.starts_at),
      title: `Custody: ${c.block_type}`,
      subtitle: "custody",
      allDay: false,
      attendees: [] as string[],
    })),
  ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const byDay = new Map<string, typeof items>();
  for (const item of items) {
    const key = format(item.startsAt, DAY_PARAM_FORMAT);
    byDay.set(key, [...(byDay.get(key) ?? []), item]);
  }

  const selectedDayKey = format(selectedDay, DAY_PARAM_FORMAT);
  const selectedDayItems = byDay.get(selectedDayKey) ?? [];

  const prevMonthHref = `/calendar?month=${format(subMonths(monthDate, 1), MONTH_PARAM_FORMAT)}`;
  const nextMonthHref = `/calendar?month=${format(addMonths(monthDate, 1), MONTH_PARAM_FORMAT)}`;

  const daysUntilSaturday = (6 - startOfDay(new Date()).getDay() + 7) % 7;
  const upcomingSaturday = format(
    new Date(startOfDay(new Date()).getTime() + (daysUntilSaturday === 0 ? 7 : daysUntilSaturday) * 86400000),
    DAY_PARAM_FORMAT
  );
  const weekendPlan = await getWeekendPlanForDate(supabase, household.id, upcomingSaturday);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Calendar</h1>
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

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <Button asChild size="icon" variant="ghost" className="size-7" aria-label="Previous month">
            <Link href={prevMonthHref}>
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          <CardTitle className="text-sm">{format(monthDate, "MMMM yyyy")}</CardTitle>
          <Button asChild size="icon" variant="ghost" className="size-7" aria-label="Next month">
            <Link href={nextMonthHref}>
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
            {WEEKDAY_LABELS.map((label, i) => (
              <span key={i}>{label}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {gridDays.map((day) => {
              const key = format(day, DAY_PARAM_FORMAT);
              const dayItems = byDay.get(key) ?? [];
              const inMonth = isSameMonth(day, monthDate);
              const selected = isSameDay(day, selectedDay);
              return (
                <Link
                  key={key}
                  href={`/calendar?month=${monthLabel}&day=${key}`}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-md py-1.5 text-xs",
                    inMonth ? "text-foreground" : "text-muted-foreground/40",
                    selected && "bg-primary text-primary-foreground",
                    !selected && isToday(day) && "font-semibold text-primary"
                  )}
                >
                  <span>{format(day, "d")}</span>
                  <span className="flex h-1.5 items-center gap-0.5">
                    {dayItems.slice(0, 3).map((item, i) => (
                      <span
                        key={i}
                        className={cn(
                          "size-1 rounded-full",
                          selected
                            ? "bg-primary-foreground"
                            : item.kind === "custody"
                              ? "bg-amber-500"
                              : "bg-primary"
                        )}
                      />
                    ))}
                  </span>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">{format(selectedDay, "EEEE, MMMM d")}</p>
        {selectedDayItems.length === 0 ? (
          <Card>
            <CardContent className="text-sm text-muted-foreground">Nothing scheduled.</CardContent>
          </Card>
        ) : (
          selectedDayItems.map((item) => (
            <Card key={item.id}>
              <CardContent className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.allDay ? "All day" : format(item.startsAt, "h:mm a")}
                    {item.attendees.length > 0 && ` · ${item.attendees.join(", ")}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{item.subtitle}</Badge>
                  <DeleteCalendarItemButton id={item.id} kind={item.kind} />
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
