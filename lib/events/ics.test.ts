import { describe, expect, it } from "vitest";
import { buildInvitationIcs } from "./ics";
import type { InvitationDetails } from "../db/repositories/event-invitations";

const details: InvitationDetails = {
  invitationId: "i",
  status: "pending",
  personalNotes: "Bring the pecan pie",
  eventTitle: "Thanksgiving, at Rusty's",
  eventDescription: "Hosted by Rusty",
  startsAt: "2026-11-26T15:00:00.000Z",
  endsAt: "2026-11-26T19:00:00.000Z",
  allDay: false,
  location: "12 Main St; Springfield",
  locationLat: null,
  locationLng: null,
  itinerary: [{ time: "15:00", title: "Arrive", notes: "" }],
  hostHousehold: "Smith Household",
  hostName: "Rusty",
};

describe("buildInvitationIcs", () => {
  it("writes floating wall-clock times and escapes text", () => {
    const ics = buildInvitationIcs(details, "tok");
    expect(ics).toContain("DTSTART:20261126T150000");
    expect(ics).toContain("DTEND:20261126T190000");
    expect(ics).toContain("SUMMARY:Thanksgiving\\, at Rusty's");
    expect(ics).toContain("LOCATION:12 Main St\\; Springfield");
    expect(ics).toContain("Note for you: Bring the pecan pie");
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.trim().endsWith("END:VCALENDAR")).toBe(true);
  });

  it("writes date-only values for an all-day event", () => {
    const ics = buildInvitationIcs({ ...details, allDay: true }, "tok");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261126");
  });
});
