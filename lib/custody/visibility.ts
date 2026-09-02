// Custody-based calendar visibility (see DECISIONS.md D-128).
//
// The user's request, verbatim: "when [a] parent has custody of a child for
// a certain day then they want that on their calendar, but they wouldn't
// want it on their calendar when they don't have the kids." Since LifeOS is
// a single shared household calendar (one user per household today — see
// concepts/person-record-and-rls), this can't mean "hide the custody block
// itself" (that block IS the answer to "who has the kids today" and stays
// visible for every day regardless, same as before this feature). It means:
// a calendar event that's actually *about* a specific child (they're an
// attendee) shouldn't clutter a parent's calendar on a day that parent
// doesn't have that child — e.g. a recurring practice you don't have to
// attend when it's not your custody day. An event a parent must attend
// regardless of custody (their own attendance_status is "required" — e.g.
// a game, not a practice, per the user's own example) always stays visible.
//
// Events with no child attendee at all are completely untouched by this
// module — this is a kid-specific filter, not a general visibility engine.
import type { AttendanceStatus } from "../db/database.types";

export interface CustodyBlockForVisibility {
  child_person_id: string;
  responsible_person_id: string;
  starts_at: string;
  ends_at: string;
}

/**
 * Who's responsible for `childPersonId` at the exact instant `at`, per the
 * household's custody blocks. Returns null if no block covers that instant
 * (a gap in the schedule — shouldn't happen with a real weekly_segments
 * schedule, but a caller must degrade safely rather than assume coverage).
 */
export function responsiblePersonForChildAt(
  childPersonId: string,
  at: Date,
  custodyBlocks: CustodyBlockForVisibility[]
): string | null {
  const t = at.getTime();
  const covering = custodyBlocks.find((b) => {
    if (b.child_person_id !== childPersonId) return false;
    const startsAt = new Date(b.starts_at).getTime();
    const endsAt = new Date(b.ends_at).getTime();
    return startsAt <= t && t < endsAt;
  });
  return covering?.responsible_person_id ?? null;
}

export interface KidLinkedEventVisibilityInput {
  viewerPersonId: string;
  /** person_id of every child attendee on this event. Non-child attendees don't belong here. */
  childAttendeePersonIds: string[];
  /** The viewer's own attendance_status row on this event, or null if the viewer isn't an attendee at all. */
  viewerAttendanceStatus: AttendanceStatus | null;
  eventStartsAt: Date;
  custodyBlocks: CustodyBlockForVisibility[];
}

/**
 * Should this kid-linked event show on `viewerPersonId`'s calendar for the
 * day it starts? True when:
 *  - it has no child attendees (rule doesn't apply — caller should treat
 *    those events as always visible without calling this at all, but it's
 *    safe to call anyway), or
 *  - the viewer's own attendance is "required" (mandatory — attend
 *    regardless of whose custody day it is), or
 *  - the viewer actually has custody of at least one attending child at the
 *    event's start time.
 * False otherwise — a different parent's custody day, and this viewer isn't
 * required to be there.
 */
export function isKidLinkedEventVisibleForViewer(input: KidLinkedEventVisibilityInput): boolean {
  const { viewerPersonId, childAttendeePersonIds, viewerAttendanceStatus, eventStartsAt, custodyBlocks } = input;
  if (childAttendeePersonIds.length === 0) return true;
  if (viewerAttendanceStatus === "required") return true;
  return childAttendeePersonIds.some(
    (childId) => responsiblePersonForChildAt(childId, eventStartsAt, custodyBlocks) === viewerPersonId
  );
}
