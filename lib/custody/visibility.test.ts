import { describe, expect, it } from "vitest";
import { isKidLinkedEventVisibleForViewer, responsiblePersonForChildAt } from "./visibility";

const RICHARD = "richard-id";
const MEL = "mel-id";
const EMLYN = "emlyn-id";

const custodyBlocks = [
  // Mel has Emlyn Tue 4:30pm -> Fri 4:30pm
  { child_person_id: EMLYN, responsible_person_id: MEL, starts_at: "2026-09-01T16:30:00.000Z", ends_at: "2026-09-04T16:30:00.000Z" },
  // Richard has Emlyn Fri 4:30pm -> Mon 8:30am
  { child_person_id: EMLYN, responsible_person_id: RICHARD, starts_at: "2026-09-04T16:30:00.000Z", ends_at: "2026-09-07T08:30:00.000Z" },
];

describe("responsiblePersonForChildAt", () => {
  it("finds the responsible parent covering the given instant", () => {
    expect(responsiblePersonForChildAt(EMLYN, new Date("2026-09-02T12:00:00.000Z"), custodyBlocks)).toBe(MEL);
    expect(responsiblePersonForChildAt(EMLYN, new Date("2026-09-05T12:00:00.000Z"), custodyBlocks)).toBe(RICHARD);
  });

  it("returns null for an uncovered instant (schedule gap)", () => {
    expect(responsiblePersonForChildAt(EMLYN, new Date("2026-09-10T12:00:00.000Z"), custodyBlocks)).toBeNull();
  });

  it("returns null for a child with no blocks at all", () => {
    expect(responsiblePersonForChildAt("other-child", new Date("2026-09-02T12:00:00.000Z"), custodyBlocks)).toBeNull();
  });
});

describe("isKidLinkedEventVisibleForViewer", () => {
  it("is always visible when there are no child attendees", () => {
    expect(
      isKidLinkedEventVisibleForViewer({
        viewerPersonId: RICHARD,
        childAttendeePersonIds: [],
        viewerAttendanceStatus: null,
        eventStartsAt: new Date("2026-09-02T12:00:00.000Z"),
        custodyBlocks,
      })
    ).toBe(true);
  });

  it("hides a soccer practice (optional) on a day the viewer doesn't have custody", () => {
    // Tuesday practice, Mel's custody day.
    expect(
      isKidLinkedEventVisibleForViewer({
        viewerPersonId: RICHARD,
        childAttendeePersonIds: [EMLYN],
        viewerAttendanceStatus: "optional",
        eventStartsAt: new Date("2026-09-01T22:00:00.000Z"),
        custodyBlocks,
      })
    ).toBe(false);
  });

  it("shows a soccer practice on a day the viewer does have custody", () => {
    // Saturday, Richard's custody day.
    expect(
      isKidLinkedEventVisibleForViewer({
        viewerPersonId: RICHARD,
        childAttendeePersonIds: [EMLYN],
        viewerAttendanceStatus: "optional",
        eventStartsAt: new Date("2026-09-05T18:00:00.000Z"),
        custodyBlocks,
      })
    ).toBe(true);
  });

  it("shows a required game even on a day the viewer doesn't have custody", () => {
    // Tuesday game the viewer must attend, Mel's custody day.
    expect(
      isKidLinkedEventVisibleForViewer({
        viewerPersonId: RICHARD,
        childAttendeePersonIds: [EMLYN],
        viewerAttendanceStatus: "required",
        eventStartsAt: new Date("2026-09-01T22:00:00.000Z"),
        custodyBlocks,
      })
    ).toBe(true);
  });

  it("shows the event if the viewer has custody of at least one of multiple child attendees", () => {
    expect(
      isKidLinkedEventVisibleForViewer({
        viewerPersonId: RICHARD,
        childAttendeePersonIds: ["other-child", EMLYN],
        viewerAttendanceStatus: "optional",
        eventStartsAt: new Date("2026-09-05T18:00:00.000Z"),
        custodyBlocks,
      })
    ).toBe(true);
  });

  it("hides the event when the viewer isn't an attendee at all and has no custody", () => {
    expect(
      isKidLinkedEventVisibleForViewer({
        viewerPersonId: RICHARD,
        childAttendeePersonIds: [EMLYN],
        viewerAttendanceStatus: null,
        eventStartsAt: new Date("2026-09-01T22:00:00.000Z"),
        custodyBlocks,
      })
    ).toBe(false);
  });
});
