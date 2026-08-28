import Link from "next/link";
import { Plus } from "lucide-react";
import type { ChildcareRequestRow, PersonRow } from "@/lib/db/database.types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CancelChildcareRequestButton } from "./cancel-childcare-request-button";

const STATUS_LABELS: Record<string, string> = {
  pending: "Waiting for response",
  accepted: "Accepted",
  declined: "Declined",
  cancelled: "Cancelled",
  expired: "Expired",
};

const STATUS_VARIANTS: Record<string, "secondary" | "outline" | "default"> = {
  pending: "outline",
  accepted: "default",
  declined: "secondary",
  cancelled: "secondary",
  expired: "secondary",
};

/**
 * D-060 childcare section, embedded on the People page rather than a
 * standalone nav destination — same reasoning as embedding Trip Ideas on
 * the Activities page (see trip-ideas-section.tsx): the bottom nav is
 * already at 6 items with no room for a 7th top-level page.
 */
export function ChildcareSection({
  requests,
  people,
}: {
  requests: ChildcareRequestRow[];
  people: PersonRow[];
}) {
  const nameById = new Map(people.map((p) => [p.id, p.nickname || p.full_name]));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Childcare requests</h2>
        <Button asChild size="sm" variant="outline">
          <Link href="/people/childcare/new">
            <Plus className="size-4" /> Request childcare
          </Link>
        </Button>
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            No childcare requests yet. Tag someone as a childcare provider on their People page, then
            request a specific date and time here — they can accept or decline by email, no LifeOS
            account needed.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {requests.map((request) => {
            const providerName = nameById.get(request.provider_person_id) ?? "Unknown";
            const childNames = request.child_person_ids.map((id) => nameById.get(id)).filter(Boolean);
            const pickupTime =
              request.status === "accepted" && request.drive_minutes_to_provider != null
                ? suggestDepartureTime(request.care_start_time, request.drive_minutes_to_provider)
                : null;
            return (
              <Card key={request.id}>
                <CardContent className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {providerName} — {request.care_date}, {request.care_start_time}–{request.care_end_time}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {childNames.length > 0 ? `For ${childNames.join(", ")}` : "No children selected"}
                      {request.event_title ? ` · ${request.event_title}` : ""}
                    </p>
                    {request.drive_minutes_to_provider != null && (
                      <p className="text-xs text-muted-foreground">
                        ~{request.drive_minutes_to_provider} min drive to drop off
                      </p>
                    )}
                    {pickupTime && (
                      <p className="text-xs text-muted-foreground">Suggested departure: {pickupTime}</p>
                    )}
                    <Badge variant={STATUS_VARIANTS[request.status] ?? "secondary"} className="mt-1">
                      {STATUS_LABELS[request.status] ?? request.status}
                    </Badge>
                  </div>
                  {request.status === "pending" && (
                    <CancelChildcareRequestButton requestId={request.id} />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** care_start_time minus drive minutes, HH:MM in, HH:MM out. No date-wrap
 * handling (a departure time that rolls to the previous day is edge-case
 * enough — e.g. a midnight care start with a long drive — that clamping
 * to 00:00 is an acceptable simplification here). */
function suggestDepartureTime(careStartTime: string, driveMinutes: number): string {
  const [h, m] = careStartTime.split(":").map(Number);
  const totalMinutes = Math.max(0, h * 60 + m - driveMinutes);
  const outH = Math.floor(totalMinutes / 60) % 24;
  const outM = totalMinutes % 60;
  return `${String(outH).padStart(2, "0")}:${String(outM).padStart(2, "0")}`;
}
