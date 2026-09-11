import { Skeleton } from "@/components/ui/skeleton";

// Redesign (Part 5 — States: Loading). Matches Today's real layout
// (app/(app)/page.tsx) card-for-card -- same outer container classes
// (rounded-card/border-line/bg-surface, same padding) as PriorityCard and
// RailCard, so nothing shifts height when the real content swaps in.
export default function TodayLoading() {
  return (
    <div className="flex flex-col gap-[26px] xl:flex-row xl:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-[18px]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-9 w-80" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-9 w-24 rounded-control" />
        </div>

        <Skeleton className="h-[54px] w-full rounded-card" />

        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-[18px] rounded-card border border-line bg-surface px-[22px] py-5">
              <Skeleton className="size-[38px] shrink-0 rounded-icon-well" />
              <div className="flex min-w-0 flex-1 flex-col gap-[9px]">
                <div className="flex items-center gap-[10px]">
                  <Skeleton className="h-[21px] w-20 rounded-chip" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-5 w-3/4" />
                <div className="flex items-center gap-2 pt-2">
                  <Skeleton className="h-9 w-24 rounded-control" />
                  <Skeleton className="h-9 w-20 rounded-control" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex w-full flex-col gap-[18px] xl:w-[342px] xl:shrink-0">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col rounded-card border border-line bg-surface px-[18px] pt-[18px] pb-4">
            <Skeleton className="h-2.5 w-24" />
            <div className="flex flex-col gap-3 pt-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
