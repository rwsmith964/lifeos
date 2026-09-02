import { describe, expect, it } from "vitest";
import { buildCustodyIcs, buildTimedCustodyIcs, mergeCustodyRuns } from "./ics";
import type { ProjectedCustodyDay, ProjectedCustodyInterval } from "./schedule";

const PARENT_A = "parent-a";
const PARENT_B = "parent-b";
const peopleNamesById = new Map([
  [PARENT_A, "Richard Smith"],
  [PARENT_B, "Jamie Smith"],
]);

describe("mergeCustodyRuns", () => {
  it("merges consecutive days assigned to the same parent into one run", () => {
    const days: ProjectedCustodyDay[] = [
      { date: "2026-09-01", responsiblePersonId: PARENT_A, isException: false },
      { date: "2026-09-02", responsiblePersonId: PARENT_A, isException: false },
      { date: "2026-09-03", responsiblePersonId: PARENT_A, isException: false },
      { date: "2026-09-04", responsiblePersonId: PARENT_B, isException: false },
    ];
    const runs = mergeCustodyRuns(days);
    expect(runs).toEqual([
      { startDate: "2026-09-01", endDate: "2026-09-03", responsiblePersonId: PARENT_A, hasException: false },
      { startDate: "2026-09-04", endDate: "2026-09-04", responsiblePersonId: PARENT_B, hasException: false },
    ]);
  });

  it("does not merge across a date gap even if the same parent is assigned on both sides", () => {
    const days: ProjectedCustodyDay[] = [
      { date: "2026-09-01", responsiblePersonId: PARENT_A, isException: false },
      { date: "2026-09-03", responsiblePersonId: PARENT_A, isException: false }, // Sep 2 skipped
    ];
    const runs = mergeCustodyRuns(days);
    expect(runs).toHaveLength(2);
  });

  it("marks a run as hasException when any day within it was an override", () => {
    const days: ProjectedCustodyDay[] = [
      { date: "2026-09-01", responsiblePersonId: PARENT_A, isException: false },
      { date: "2026-09-02", responsiblePersonId: PARENT_A, isException: true },
    ];
    const runs = mergeCustodyRuns(days);
    expect(runs[0].hasException).toBe(true);
  });
});

describe("buildCustodyIcs", () => {
  it("produces a valid VCALENDAR with one VEVENT per run, using RFC 5545 exclusive DTEND", () => {
    const ics = buildCustodyIcs({
      scheduleId: "sched-1",
      childName: "Emma",
      runs: [{ startDate: "2026-09-01", endDate: "2026-09-07", responsiblePersonId: PARENT_A, hasException: false }],
      peopleNamesById,
      generatedAt: new Date("2026-08-26T00:00:00Z"),
    });

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260901");
    // Exclusive end: last covered day is Sep 7, so DTEND is Sep 8.
    expect(ics).toContain("DTEND;VALUE=DATE:20260908");
    expect(ics).toContain("SUMMARY:Emma with Richard Smith");
    expect(ics).toContain("UID:sched-1-2026-09-01@lifeos-custody");
  });

  it("falls back to \"Unknown\" for a responsible person id missing from the name map", () => {
    const ics = buildCustodyIcs({
      scheduleId: "sched-1",
      childName: "Emma",
      runs: [{ startDate: "2026-09-01", endDate: "2026-09-01", responsiblePersonId: "ghost", hasException: false }],
      peopleNamesById,
    });
    expect(ics).toContain("SUMMARY:Emma with Unknown");
  });

  it("escapes commas, semicolons, and backslashes in text fields", () => {
    const ics = buildCustodyIcs({
      scheduleId: "sched-1",
      childName: "Anna, Jr.",
      runs: [{ startDate: "2026-09-01", endDate: "2026-09-01", responsiblePersonId: PARENT_A, hasException: false }],
      peopleNamesById,
    });
    expect(ics).toContain("SUMMARY:Anna\\, Jr. with Richard Smith");
  });

  it("adds a DESCRIPTION line only for runs containing an exception day", () => {
    const withException = buildCustodyIcs({
      scheduleId: "sched-1",
      childName: "Emma",
      runs: [{ startDate: "2026-09-01", endDate: "2026-09-01", responsiblePersonId: PARENT_A, hasException: true }],
      peopleNamesById,
    });
    const withoutException = buildCustodyIcs({
      scheduleId: "sched-1",
      childName: "Emma",
      runs: [{ startDate: "2026-09-01", endDate: "2026-09-01", responsiblePersonId: PARENT_A, hasException: false }],
      peopleNamesById,
    });
    expect(withException).toContain("DESCRIPTION:");
    expect(withoutException).not.toContain("DESCRIPTION:");
  });

  it("produces stable, re-import-safe UIDs across regenerations for the same schedule and start date", () => {
    const runs = [{ startDate: "2026-09-01", endDate: "2026-09-01", responsiblePersonId: PARENT_A, hasException: false }];
    const first = buildCustodyIcs({ scheduleId: "sched-1", childName: "Emma", runs, peopleNamesById });
    const second = buildCustodyIcs({ scheduleId: "sched-1", childName: "Emma", runs, peopleNamesById, generatedAt: new Date("2027-01-01") });
    const extractUid = (ics: string) => ics.match(/UID:(.+)/)?.[1];
    expect(extractUid(first)).toBe(extractUid(second));
  });

  it("returns a calendar with no VEVENTs when there are no runs, without throwing", () => {
    const ics = buildCustodyIcs({ scheduleId: "sched-1", childName: "Emma", runs: [], peopleNamesById });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });
});

describe("buildTimedCustodyIcs", () => {
  it("produces one VEVENT per interval with real clock start/end times, splitting a day across two events", () => {
    const intervals: ProjectedCustodyInterval[] = [
      { startsAt: "2026-09-04T00:00:00", endsAt: "2026-09-04T16:30:00", responsiblePersonId: PARENT_B, isException: false },
      { startsAt: "2026-09-04T16:30:00", endsAt: "2026-09-07T08:30:00", responsiblePersonId: PARENT_A, isException: false },
    ];
    const ics = buildTimedCustodyIcs({ scheduleId: "sched-2", childName: "Emma", intervals, peopleNamesById });
    const veventCount = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
    expect(veventCount).toBe(2);
    expect(ics).toContain("DTSTART:20260904T000000");
    expect(ics).toContain("DTEND:20260904T163000");
    expect(ics).toContain("DTSTART:20260904T163000");
    expect(ics).toContain("DTEND:20260907T083000");
    // Floating local time — no trailing Z, no TZID.
    expect(ics).not.toMatch(/DTSTART:\d{8}T\d{6}Z/);
  });

  it("adds a DESCRIPTION line only for an exception interval", () => {
    const withException = buildTimedCustodyIcs({
      scheduleId: "sched-2",
      childName: "Emma",
      intervals: [{ startsAt: "2026-09-04T00:00:00", endsAt: "2026-09-05T00:00:00", responsiblePersonId: PARENT_A, isException: true }],
      peopleNamesById,
    });
    const withoutException = buildTimedCustodyIcs({
      scheduleId: "sched-2",
      childName: "Emma",
      intervals: [{ startsAt: "2026-09-04T00:00:00", endsAt: "2026-09-05T00:00:00", responsiblePersonId: PARENT_A, isException: false }],
      peopleNamesById,
    });
    expect(withException).toContain("DESCRIPTION:");
    expect(withoutException).not.toContain("DESCRIPTION:");
  });

  it("falls back to \"Unknown\" for a responsible person id missing from the name map", () => {
    const ics = buildTimedCustodyIcs({
      scheduleId: "sched-2",
      childName: "Emma",
      intervals: [{ startsAt: "2026-09-04T00:00:00", endsAt: "2026-09-05T00:00:00", responsiblePersonId: "ghost", isException: false }],
      peopleNamesById,
    });
    expect(ics).toContain("Emma with Unknown");
  });

  it("produces stable, re-import-safe UIDs across regenerations for the same schedule and interval", () => {
    const intervals: ProjectedCustodyInterval[] = [
      { startsAt: "2026-09-04T00:00:00", endsAt: "2026-09-05T00:00:00", responsiblePersonId: PARENT_A, isException: false },
    ];
    const first = buildTimedCustodyIcs({ scheduleId: "sched-2", childName: "Emma", intervals, peopleNamesById });
    const second = buildTimedCustodyIcs({ scheduleId: "sched-2", childName: "Emma", intervals, peopleNamesById, generatedAt: new Date("2027-01-01") });
    const extractUid = (ics: string) => ics.match(/UID:(.+)/)?.[1];
    expect(extractUid(first)).toBe(extractUid(second));
  });

  it("returns a calendar with no VEVENTs when there are no intervals, without throwing", () => {
    const ics = buildTimedCustodyIcs({ scheduleId: "sched-2", childName: "Emma", intervals: [], peopleNamesById });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });
});
