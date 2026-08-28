import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
import type { PersonRow, TripIdeaRow } from "@/lib/db/database.types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DeleteTripIdeaButton } from "./delete-trip-idea-button";

const STATUS_LABELS: Record<string, string> = {
  idea: "Someday idea",
  planned: "Planned",
  booked: "Booked",
  done: "Done",
  abandoned: "Abandoned",
};

export function TripIdeasSection({ tripIdeas, people }: { tripIdeas: TripIdeaRow[]; people: PersonRow[] }) {
  const nameById = new Map(people.map((p) => [p.id, p.full_name]));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Big trips &amp; bucket list</h2>
        <Button asChild size="sm" variant="outline">
          <Link href="/activities/trips/new">
            <Plus className="size-4" /> Add trip idea
          </Link>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Someday/annual-planning trips — separate from your regular activities above. Pick who you&apos;d want to go with.
      </p>

      {tripIdeas.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            No trip ideas yet. Add a bucket-list trip (e.g. &ldquo;Alaska fishing trip&rdquo;) whenever the idea comes up.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {tripIdeas.map((trip) => {
            const companionNames = trip.companion_person_ids.map((id) => nameById.get(id)).filter(Boolean);
            return (
              <Card key={trip.id}>
                <CardContent className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{trip.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {trip.target_timeframe ? `${trip.target_timeframe} · ` : ""}
                      {companionNames.length > 0 ? `with ${companionNames.join(", ")}` : "no companions picked yet"}
                    </p>
                    {trip.description && <p className="mt-1 text-xs text-muted-foreground">{trip.description}</p>}
                    <Badge variant="outline" className="mt-1">
                      {STATUS_LABELS[trip.status] ?? trip.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button asChild size="icon" variant="ghost" className="size-8">
                      <Link href={`/activities/trips/${trip.id}/edit`} aria-label="Edit trip idea">
                        <Pencil className="size-4" />
                      </Link>
                    </Button>
                    <DeleteTripIdeaButton tripIdeaId={trip.id} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
