import { Skeleton } from "@/components/ui/skeleton";

// Redesign (Part 5 — States: Loading). Matches Calendar's real week-view
// layout (app/(app)/calendar/page.tsx's WeekTimelineView): header, range/
// view segmented controls, and a 7-column grid card.
export default function CalendarLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-9 w-56" />
        <div className="flex items-center gap-2">
          <Skeleton className="size-9 rounded-control" />
          <Skeleton className="h-9 w-16 rounded-control" />
          <Skeleton className="size-9 rounded-control" />
          <Skeleton className="h-9 w-20 rounded-control" />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-9 w-64 rounded-control" />
        <Skeleton className="h-9 w-32 rounded-control" />
      </div>
      <div className="rounded-card border border-line bg-surface p-4">
        <div className="grid grid-cols-7 gap-2">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-control" />
          ))}
        </div>
        <Skeleton className="mt-3 h-[420px] w-full" />
      </div>
    </div>
  );
}
