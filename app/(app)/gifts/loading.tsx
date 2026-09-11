import { Skeleton } from "@/components/ui/skeleton";

// Redesign (Part 5 — States: Loading). Matches Gifts' real layout
// (app/(app)/gifts/page.tsx): timeline card, a person heading + group
// header, and a 4-column idea-card grid, with the YTD sidebar card.
export default function GiftsLoading() {
  return (
    <div className="flex flex-col gap-[18px] xl:flex-row xl:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-[18px]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-3 w-64" />
          </div>
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-[86px] w-full rounded-card" />
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-input" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-14 w-full rounded-card" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
              <Skeleton className="h-[88px] w-full rounded-input" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-5 w-1/3" />
            </div>
          ))}
        </div>
      </div>
      <div className="w-full xl:w-[280px] xl:shrink-0">
        <div className="rounded-card border border-line bg-surface px-[18px] pt-[18px] pb-4">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="mt-3 h-9 w-20" />
          <Skeleton className="mt-2 h-3 w-32" />
        </div>
      </div>
    </div>
  );
}
