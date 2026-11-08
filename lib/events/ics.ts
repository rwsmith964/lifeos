// A one-event .ics file for "Add to my calendar" on an invitation. Times are the
// stored wall-clock values written as floating (no timezone), so it lands at
// the same clock time wherever the guest's calendar app is.
import type { InvitationDetails } from "../db/repositories/event-invitations";

function stamp(iso: string, allDay: boolean): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  return allDay ? date : `${date}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`;
}

function esc(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export function buildInvitationIcs(details: InvitationDetails, uid: string): string {
  const itinerary = details.itinerary.map((i) => `${i.time ? `${i.time} ` : ""}${i.title}`).join("\n");
  const description = [
    details.eventDescription,
    details.personalNotes ? `Note for you: ${details.personalNotes}` : null,
    itinerary ? `Plan:\n${itinerary}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LifeOS//Invitation//EN",
    "BEGIN:VEVENT",
    `UID:${uid}@lifeos`,
    details.allDay ? `DTSTART;VALUE=DATE:${stamp(details.startsAt, true)}` : `DTSTART:${stamp(details.startsAt, false)}`,
    details.allDay ? `DTEND;VALUE=DATE:${stamp(details.endsAt, true)}` : `DTEND:${stamp(details.endsAt, false)}`,
    `SUMMARY:${esc(details.eventTitle)}`,
    details.location ? `LOCATION:${esc(details.location)}` : "",
    description ? `DESCRIPTION:${esc(description)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.join("\r\n") + "\r\n";
}
