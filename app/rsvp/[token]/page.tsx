import Link from "next/link";
import { format } from "date-fns";
import { createSupabaseServerClient } from "@/lib/db/client-server";
import { getInvitationDetails } from "@/lib/db/repositories/event-invitations";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_NAME } from "@/lib/constants";
import { RsvpButtons } from "./rsvp-buttons";

export const metadata = {
  title: "You're invited",
};

// Public: opened from the emailed link, no account needed. The token is the
// credential. Times are floating wall-clock values, formatted as stored.
export default async function RsvpPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createSupabaseServerClient();
  const details = /^[0-9a-f-]{36}$/i.test(token) ? await getInvitationDetails(supabase, token).catch(() => null) : null;

  if (!details) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invitation not found</CardTitle>
            <CardDescription>This link isn&apos;t valid. Ask the host to send it again.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const start = new Date(details.startsAt);
  const end = new Date(details.endsAt);
  const when = details.allDay
    ? format(start, "EEEE, MMMM d")
    : `${format(start, "EEEE, MMMM d")} · ${format(start, "h:mm a")}–${format(end, "h:mm a")}`;
  const mapsUrl = details.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(details.location)}` : null;

  return (
    <div className="flex min-h-dvh flex-col items-center gap-6 p-6">
      <p className="font-sans text-metadata text-meta">{details.hostName ?? details.hostHousehold} invited you</p>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{details.eventTitle}</CardTitle>
          <CardDescription>{when}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {details.location && (
            <p className="text-sm">
              <span className="font-medium">Where: </span>
              {details.location}{" "}
              {mapsUrl && (
                <a href={mapsUrl} className="underline" target="_blank" rel="noreferrer">
                  Map
                </a>
              )}
            </p>
          )}
          {details.personalNotes && (
            <p className="rounded-md bg-muted/50 p-3 text-sm">
              <span className="font-medium">A note for you: </span>
              {details.personalNotes}
            </p>
          )}
          {details.eventDescription && <p className="whitespace-pre-line text-sm text-muted-foreground">{details.eventDescription}</p>}
          {details.itinerary.length > 0 && (
            <div>
              <p className="text-sm font-medium">The plan</p>
              <ul className="mt-1 flex flex-col gap-1 text-sm">
                {details.itinerary.map((item, i) => (
                  <li key={i}>
                    {item.time && <span className="font-medium">{item.time} </span>}
                    {item.title}
                    {item.notes && <span className="text-muted-foreground"> — {item.notes}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <RsvpButtons token={token} current={details.status} />

          {details.status === "accepted" && (
            <Button asChild variant="outline">
              <a href={`/rsvp/${token}/calendar.ics`}>Add to my calendar</a>
            </Button>
          )}
        </CardContent>
      </Card>
      <p className="max-w-md text-center text-xs text-muted-foreground">
        Have {APP_NAME}?{" "}
        <Link href="/login" className="underline">
          Sign in
        </Link>{" "}
        and the invitation is waiting on your calendar, with drive-time and prep reminders.
      </p>
    </div>
  );
}
