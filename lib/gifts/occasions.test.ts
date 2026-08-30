import { describe, expect, it } from "vitest";
import {
  CHRISTMAS_MONTH_DAY,
  extractMonthDay,
  nearestUpcomingOccasionForPerson,
  nextOccurrenceOfMonthDay,
  scanUpcomingOccasions,
} from "./occasions";
import type { PersonRow } from "../db/database.types";

describe("extractMonthDay", () => {
  it("parses month/day and ignores the (possibly placeholder) year", () => {
    expect(extractMonthDay("1984-03-14")).toEqual({ month: 3, day: 14 });
  });

  it("throws on a malformed date string", () => {
    expect(() => extractMonthDay("not-a-date")).toThrow();
  });
});

describe("nextOccurrenceOfMonthDay", () => {
  it("returns this year's date when it hasn't happened yet", () => {
    const today = new Date(2026, 7, 1); // Aug 1, 2026
    const next = nextOccurrenceOfMonthDay({ month: 9, day: 1 }, today);
    expect(next).toEqual(new Date(2026, 8, 1));
  });

  it("rolls to next year when the date already passed", () => {
    const today = new Date(2026, 7, 1); // Aug 1, 2026
    const next = nextOccurrenceOfMonthDay({ month: 3, day: 14 }, today);
    expect(next).toEqual(new Date(2027, 2, 14));
  });

  it("treats 'today' itself as upcoming, not passed", () => {
    const today = new Date(2026, 7, 1);
    const next = nextOccurrenceOfMonthDay({ month: 8, day: 1 }, today);
    expect(next).toEqual(new Date(2026, 7, 1));
  });

  it("observes a Feb 29 birthday on Feb 28 in a non-leap year", () => {
    const today = new Date(2027, 0, 1); // Jan 1, 2027 (not a leap year)
    const next = nextOccurrenceOfMonthDay({ month: 2, day: 29 }, today);
    expect(next).toEqual(new Date(2027, 1, 28));
  });

  it("uses Feb 29 itself in a leap year", () => {
    const today = new Date(2028, 0, 1); // 2028 is a leap year
    const next = nextOccurrenceOfMonthDay({ month: 2, day: 29 }, today);
    expect(next).toEqual(new Date(2028, 1, 29));
  });
});

function person(overrides: Partial<PersonRow>): Pick<
  PersonRow,
  "id" | "relationship_type" | "birthdate" | "anniversary" | "is_archived"
> {
  return {
    id: "p1",
    relationship_type: "friend",
    birthdate: null,
    anniversary: null,
    is_archived: false,
    ...overrides,
  };
}

describe("scanUpcomingOccasions", () => {
  const today = new Date(2026, 7, 1); // Aug 1, 2026

  it("finds a birthday within the horizon", () => {
    const people = [person({ id: "dave", birthdate: "1984-08-19" })]; // 18 days out
    const results = scanUpcomingOccasions(people, today, 60);
    expect(results).toContainEqual(
      expect.objectContaining({ personId: "dave", occasionType: "birthday" })
    );
  });

  it("excludes a birthday outside the horizon", () => {
    const people = [person({ id: "dave", birthdate: "1984-12-01" })]; // ~120 days out
    const results = scanUpcomingOccasions(people, today, 60);
    expect(results.some((r) => r.occasionType === "birthday")).toBe(false);
  });

  it("excludes relationship_type 'self' entirely", () => {
    const people = [person({ id: "richard", relationship_type: "self", birthdate: "1985-08-10" })];
    const results = scanUpcomingOccasions(people, today, 60);
    expect(results).toEqual([]);
  });

  it("excludes archived people", () => {
    const people = [person({ id: "old", birthdate: "1984-08-10", is_archived: true })];
    const results = scanUpcomingOccasions(people, today, 60);
    expect(results).toEqual([]);
  });

  it("includes an anniversary within the horizon", () => {
    const people = [
      person({ id: "jen", relationship_type: "co_parent", anniversary: "2010-09-15" }),
    ];
    const results = scanUpcomingOccasions(people, today, 60);
    expect(results).toContainEqual(
      expect.objectContaining({ personId: "jen", occasionType: "anniversary" })
    );
  });

  it("includes christmas for every non-self person once within horizon", () => {
    const decemberToday = new Date(2026, 10, 20); // Nov 20 -> Dec 25 is 35 days out
    const people = [person({ id: "dave" }), person({ id: "mike" })];
    const results = scanUpcomingOccasions(people, decemberToday, 60);
    expect(results.filter((r) => r.occasionType === "christmas")).toHaveLength(2);
  });

  it("returns results sorted by occasion date ascending", () => {
    const people = [
      person({ id: "later", birthdate: "1984-09-25" }),
      person({ id: "sooner", birthdate: "1984-08-05" }),
    ];
    const results = scanUpcomingOccasions(people, today, 60);
    expect(results.map((r) => r.personId)).toEqual(["sooner", "later"]);
  });

  it("matches CHRISTMAS_MONTH_DAY constant (Dec 25)", () => {
    expect(CHRISTMAS_MONTH_DAY).toEqual({ month: 12, day: 25 });
  });
});

describe("nearestUpcomingOccasionForPerson", () => {
  const today = new Date(2026, 7, 1); // Aug 1, 2026

  it("picks the birthday over the farther-off Christmas (the P1-9 default-occasion fix)", () => {
    const cal = person({ id: "cal", birthdate: "1984-08-19" }); // 18 days out, well before Dec 25
    const result = nearestUpcomingOccasionForPerson(cal, today);
    expect(result).toEqual(expect.objectContaining({ personId: "cal", occasionType: "birthday" }));
  });

  it("prefers a birthday that passed 3 days ago over the mathematically-nearer future Christmas (Cal's exact reported case)", () => {
    // today = Aug 30; birthday = Aug 27 (3 days ago); Christmas (Dec 25) is
    // the nearer *future* date, but the recent-past birthday should win.
    const cal = person({ id: "cal", birthdate: "2022-08-27" });
    const result = nearestUpcomingOccasionForPerson(cal, new Date(2026, 7, 30));
    expect(result).toEqual(
      expect.objectContaining({
        personId: "cal",
        occasionType: "birthday",
        occasionDate: new Date(2026, 7, 27),
      })
    );
  });

  it("does not use a birthday that passed more than the lookback window ago", () => {
    const cal = person({ id: "cal", birthdate: "2022-08-20" }); // 10 days ago
    const result = nearestUpcomingOccasionForPerson(cal, new Date(2026, 7, 30));
    expect(result).toEqual(expect.objectContaining({ personId: "cal", occasionType: "christmas" }));
  });

  it("falls back to Christmas when no birthday/anniversary is on file", () => {
    const result = nearestUpcomingOccasionForPerson(person({ id: "mystery" }), today);
    expect(result).toEqual(expect.objectContaining({ personId: "mystery", occasionType: "christmas" }));
  });

  it("returns null for an excluded person ('self')", () => {
    const result = nearestUpcomingOccasionForPerson(
      person({ id: "richard", relationship_type: "self", birthdate: "1985-08-10" }),
      today
    );
    expect(result).toBeNull();
  });
});
