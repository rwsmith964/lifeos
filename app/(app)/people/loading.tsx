import { Skeleton } from "@/components/ui/skeleton";

// Redesign (Part 5 — States: Loading). Matches People's real layout
// (people-table-client.tsx's TableRow grid + the 320px detail pane).
export default function PeopleLoading() {
  return (
    <div className="flex flex-col gap-[18px] xl:flex-row xl:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-9 w-20 rounded-control" />
        </div>
        <Skeleton className="h-11 w-full max-w-md rounded-control" />
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4 rounded-table-row border border-line px-4 py-[14px]">
              <div className="flex flex-1 items-center gap-2.5">
                <Skeleton className="size-9 shrink-0 rounded-input" />
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-9 w-20 rounded-control" />
            </div>
          ))}
        </div>
      </div>

      <div className="hidden rounded-card border border-line bg-surface p-[18px] xl:block xl:w-[320px] xl:shrink-0">
        <div className="flex items-center gap-3">
          <Skeleton className="size-11 shrink-0 rounded-input" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Skeleton className="h-9 w-16 rounded-control" />
          <Skeleton className="h-9 w-16 rounded-control" />
        </div>
      </div>
    </div>
  );
}
