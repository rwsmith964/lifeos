import { Skeleton } from "@/components/ui/skeleton";

// Redesign (Part 5 — States: Loading). Matches Plan's real layout
// (app/(app)/activities/page.tsx): weekend header, two day sections each
// with a dashed empty-slot-height placeholder, right rail below xl.
export default function PlanLoading() {
  return (
    <div className="flex flex-col gap-[18px] xl:flex-row xl:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-[18px]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-44" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-9 w-40 rounded-control" />
        </div>
        {[0, 1].map((i) => (
          <div key={i} className="flex flex-col gap-3">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-24 w-full rounded-card" />
          </div>
        ))}
        <div className="rounded-card border border-line bg-surface px-[18px] pt-[18px] pb-4">
          <Skeleton className="h-2.5 w-32" />
          <Skeleton className="mt-3 h-14 w-full" />
        </div>
      </div>
      <div className="flex w-full flex-col gap-[18px] xl:w-[320px] xl:shrink-0">
        <div className="rounded-card border border-line bg-surface px-[18px] pt-[18px] pb-4">
          <Skeleton className="h-2.5 w-28" />
          <div className="flex flex-col gap-3 pt-3">
            <Skeleton className="h-16 w-full rounded-input" />
            <Skeleton className="h-16 w-full rounded-input" />
          </div>
        </div>
      </div>
    </div>
  );
}
