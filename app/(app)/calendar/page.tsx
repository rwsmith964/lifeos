import Link from "next/link";
import { ChevronLeft, ChevronRight, MapPin, Plus } from "lucide-react";
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
import { listPeopleForHousehold } from "@/lib/db/repositories/people";
import { getWeekendPlanForDate } from "@/lib/db/repositories/system";
import { buildChildColorMap } from "@/lib/custody/colors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DeleteCalendarItemButton } from "./delete-item-button";
import { GenerateWeekendPlanButton } from "./generate-weekend-plan-button";

const MONTH_PARAM_FORMAT = "yyyy-MM";
const DAY_PARAM_FORMAT = "yyyy-MM-dd";
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

// Human labels for the raw event_type / block_type enum values (Phase 3
// backlog: "raw enum chips shown unstyled" — these used to render via a
// bare `.replace(/_/g, " ")`, so e.g. "kid_activity" showed as the
// unstyled, lowercase "kid activity" chip instead of a proper label).
const EVENT_TYPE_LABELS: Record<string, string> = {
  personal: "Personal",
  work: "Work",
  family: "Family",
  custody: "Custody",
  kid_activity: "Kid activity",
  prep: "Prep",
  travel: "Travel",
};
const BLOCK_TYPE_LABELS: Record<string, string> = {
  regular: "Regular",
  holiday: "Holiday",
  swap: "Swap",
  vacation: "Vacation",
};
function humanizeChipLabel(raw: string): string {
  return (
    EVENT_TYPE_LABELS[raw] ??
    BLOCK_TYPE_LABELS[raw] ??
    raw.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}

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

interface DayItem {
  id: string;
  kind: "event" | "custody";
  startsAt: Date;
  endsAt: Date;
  title: string;
  subtitle: string;
  allDay: boolean;
  attendees: string[];
  location: string | null;
  dotClassName: string;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; day?: string; view?: string }>;
}) {
  const { month: monthParam, day: dayParam, view: viewParam } = await searchParams;
  const { supabase, household } = await requireHouseholdContext();
  const view = viewParam === "custody" ? "custody" : "all";

  const monthDate = parseMonthParam(monthParam);
  const selectedDay = parseDayParam(dayParam, monthDate);
  const monthLabel = format(monthDate, MONTH_PARAM_FORMAT);

  const gridStart = startOfWeek(startOfMonth(monthDate));
  const gridEnd = endOfWeek(endOfMonth(monthDate));
  const gridDays = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const [events, custodyBlocks, people] = await Promise.all([
    listEventsInRange(supabase, household.id, gridStart.toISOString(), gridEnd.toISOString()),
    listCustodyBlocksForHouseholdInRange(supabase, household.id, gridStart.toISOString(), gridEnd.toISOString()),
    listPeopleForHousehold(supabase, household.id),
  ]);
  const attendeesByEvent = await listAttendeeNamesForEvents(
    supabase,
    events.map((e) => e.id)
  );

  const peopleById = new Map(people.map((p) => [p.id, p.nickname || p.full_name]));
  const childColors = buildChildColorMap(people.filter((p) => p.relationship_type === "child").map((p) => p.id));
  const defaultChildColor = { dot: "bg-primary", badge: "bg-muted text-foreground" };

  const eventItems: DayItem[] = events.map((e) => ({
    id: e.id,
    kind: "event",
    startsAt: new Date(e.starts_at),
    endsAt: new Date(e.ends_at),
    title: e.title,
    subtitle: e.event_type,
    allDay: e.all_day,
    attendees: attendeesByEvent.get(e.id) ?? [],
    location: e.location,
    dotClassName: "bg-primary",
  }));

  const custodyItems: DayItem[] = custodyBlocks.map((c) => {
    const color = childColors.get(c.child_person_id) ?? defaultChildColor;
    const childName = peopleById.get(c.child_person_id) ?? "Someone";
    const responsibleName = peopleById.get(c.responsible_person_id) ?? "Unknown";
    return {
      id: c.id,
      kind: "custody",
      startsAt: new Date(c.starts_at),
      endsAt: new Date(c.ends_at),
      title: `${childName} with ${responsibleName}`,
      subtitle: c.block_type,
      allDay: false,
      attendees: [],
      location: c.location,
      dotClassName: color.dot,
    };
  });

  const items = view === "custody" ? custodyItems : [...eventItems, ...custodyItems].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  // A block/event is a span, not a point — index it under every calendar
  // day it covers, not just the day it starts. Missing this was why a
  // multi-day custody block only showed on its first day (round-2 D-033,
  // brief 2.1) — the underlying query fix is in
  // lib/db/repositories/calendar.ts; this is the display-side half.
  const byDay = new Map<string, DayItem[]>();
  for (const item of items) {
    const spanEnd = item.endsAt > item.startsAt ? item.endsAt : item.startsAt;
    for (const day of eachDayOfInterval({ start: startOfDay(item.startsAt), end: startOfDay(spanEnd) })) {
      if (day < gridStart || day > gridEnd) continue;
      const key = format(day, DAY_PARAM_FORMAT);
      byDay.set(key, [...(byDay.get(key) ?? []), item]);
    }
  }

  const selectedDayKey = format(selectedDay, DAY_PARAM_FORMAT);
  const selectedDayItems = byDay.get(selectedDayKey) ?? [];

  const viewQuery = view === "custody" ? "&view=custody" : "";
  const prevMonthHref = `/calendar?month=${format(subMonths(monthDate, 1), MONTH_PARAM_FORMAT)}${viewQuery}`;
  const nextMonthHref = `/calendar?month=${format(addMonths(monthDate, 1), MONTH_PARAM_FORMAT)}${viewQuery}`;

  const today = startOfDay(new Date());
  const daysUntilSaturday = (6 - today.getDay() + 7) % 7;
  // "This weekend" means the Saturday still ahead of (or today, if today
  // IS Saturday) the current day — not next Saturday when today already
  // is one (round-2 brief 3.1: hard-coded phrasing reading wrong on a
  // weekend).
  const upcomingSaturday = format(new Date(today.getTime() + daysUntilSaturday * 86400000), DAY_PARAM_FORMAT);
  const weekendLabel = daysUntilSaturday === 0 ? "This weekend" : `This weekend (${format(new Date(upcomingSaturday), "MMM d")})`;
  const weekendPlan = await getWeekendPlanForDate(supabase, household.id, upcomingSaturday);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Calendar</h1>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/calendar/custody">Custody</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/calendar/new">
              <Plus className="size-4" /> Add
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex gap-1 rounded-md bg-muted p-1 text-sm">
        <Link
          href={`/calendar?month=${monthLabel}&day=${selectedDayKey}`}
          className={cn("flex-1 rounded px-3 py-1.5 text-center", view === "all" ? "bg-background font-medium shadow-xs" : "text-muted-foreground")}
        >
          All
        </Link>
        <Link
          href={`/calendar?month=${monthLabel}&day=${selectedDayKey}&view=custody`}
          className={cn("flex-1 rounded px-3 py-1.5 text-center", view === "custody" ? "bg-background font-medium shadow-xs" : "text-muted-foreground")}
        >
          Custody
        </Link>
      </div>

      {view === "custody" && childColors.size > 0 && (
        <div className="flex flex-wrap gap-3">
          {[...childColors.entries()].map(([childId, color]) => (
            <div key={childId} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn("size-2 rounded-full", color.dot)} />
              {peopleById.get(childId) ?? "Child"}
            </div>
          ))}
        </div>
      )}

      {view === "all" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{weekendLabel}</CardTitle>
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
      )}

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
                  href={`/calendar?month=${monthLabel}&day=${key}${viewQuery}`}
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
                        className={cn("size-1 rounded-full", selected ? "bg-primary-foreground" : item.dotClassName)}
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
            <CardContent className="text-sm text-muted-foreground">
              Nothing scheduled.{" "}
              <Link href={`/calendar/new?date=${selectedDayKey}`} className="underline underline-offset-2">
                Add something
              </Link>
              .
            </CardContent>
          </Card>
        ) : (
          selectedDayItems.map((item) => (
            <Card key={item.id}>
              <CardContent className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.allDay ? "All day" : format(item.startsAt, "h:mm a")}
                    {item.attendees.length > 0 && ` · ${item.attendees.join(", ")}`}
                    {item.location && (
                      <span className="inline-flex items-center gap-0.5">
                        {" "}
                        · <MapPin className="size-3" /> {item.location}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{humanizeChipLabel(item.subtitle)}</Badge>
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
