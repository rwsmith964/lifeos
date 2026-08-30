import { describe, expect, it } from "vitest";
import { birthdayLeadTimeLabel, birthdaysInRange, birthdaysToSurfaceInBrief, birthdayTitle } from "./birthdays";

function makePerson(overrides: Partial<Parameters<typeof birthdaysInRange>[0][number]> = {}) {
  return {
    id: "person-1",
    full_name: "Jack Smith",
    nickname: null,
    birthdate: "2015-08-30",
    birth_year_known: true,
    is_archived: false,
    ...overrides,
  };
}

describe("birthdaysInRange", () => {
  it("finds a birthday falling within the range and computes the turning age", () => {
    const items = birthdaysInRange([makePerson()], new Date(2026, 7, 25), new Date(2026, 8, 5));
    expect(items).toHaveLength(1);
    expect(items[0].personId).toBe("person-1");
    expect(items[0].date.getMonth()).toBe(7); // August (0-indexed)
    expect(items[0].date.getDate()).toBe(30);
    expect(items[0].age).toBe(11); // 2026 - 2015
  });

  it("returns no age when birth_year_known is false", () => {
    const items = birthdaysInRange(
      [makePerson({ birth_year_known: false })],
      new Date(2026, 7, 25),
      new Date(2026, 8, 5)
    );
    expect(items[0].age).toBeNull();
  });

  it("uses the nickname when present, else full_name", () => {
    const items = birthdaysInRange(
      [makePerson({ nickname: "Jackie" })],
      new Date(2026, 7, 25),
      new Date(2026, 8, 5)
    );
    expect(items[0].personName).toBe("Jackie");
  });

  it("skips people with no birthdate", () => {
    const items = birthdaysInRange([makePerson({ birthdate: null })], new Date(2026, 7, 1), new Date(2026, 7, 31));
    expect(items).toHaveLength(0);
  });

  it("skips archived people", () => {
    const items = birthdaysInRange(
      [makePerson({ is_archived: true })],
      new Date(2026, 7, 25),
      new Date(2026, 8, 5)
    );
    expect(items).toHaveLength(0);
  });

  it("returns nothing when the birthday falls outside the range", () => {
    const items = birthdaysInRange([makePerson()], new Date(2026, 0, 1), new Date(2026, 0, 31));
    expect(items).toHaveLength(0);
  });

  it("observes a Feb 29 birthdate on Feb 28 in a non-leap year", () => {
    const items = birthdaysInRange(
      [makePerson({ birthdate: "2000-02-29" })],
      new Date(2026, 1, 20),
      new Date(2026, 2, 5)
    );
    expect(items).toHaveLength(1);
    expect(items[0].date.getMonth()).toBe(1); // February
    expect(items[0].date.getDate()).toBe(28);
  });

  it("finds the real Feb 29 occurrence in a leap year", () => {
    const items = birthdaysInRange(
      [makePerson({ birthdate: "2000-02-29" })],
      new Date(2028, 1, 20),
      new Date(2028, 2, 5)
    );
    expect(items).toHaveLength(1);
    expect(items[0].date.getDate()).toBe(29);
  });

  it("returns multiple occurrences when the range spans more than a year", () => {
    const items = birthdaysInRange([makePerson()], new Date(2026, 0, 1), new Date(2027, 11, 31));
    expect(items).toHaveLength(2);
  });
});

describe("birthdaysToSurfaceInBrief", () => {
  it("surfaces a birthday 3 days ago (the exact reported bug: Aug 27 birthday, Aug 30 today)", () => {
    const items = birthdaysToSurfaceInBrief([makePerson({ birthdate: "2018-08-27" })], new Date(2026, 7, 30));
    expect(items).toHaveLength(1);
    expect(items[0].daysUntil).toBe(-3);
  });

  it("surfaces each forward milestone: 30/14/7/3/1/0 days out", () => {
    for (const daysOut of [30, 14, 7, 3, 1, 0]) {
      const today = new Date(2026, 5, 1);
      const birthdayDate = new Date(2026, 5, 1 + daysOut);
      const iso = `2010-${String(birthdayDate.getMonth() + 1).padStart(2, "0")}-${String(birthdayDate.getDate()).padStart(2, "0")}`;
      const items = birthdaysToSurfaceInBrief([makePerson({ birthdate: iso })], today);
      expect(items, `expected a hit at ${daysOut} days out`).toHaveLength(1);
      expect(items[0].daysUntil).toBe(daysOut);
    }
  });

  it("does not surface a birthday on a non-milestone day (e.g. 15 days out)", () => {
    const items = birthdaysToSurfaceInBrief([makePerson({ birthdate: "2010-06-16" })], new Date(2026, 5, 1));
    expect(items).toHaveLength(0);
  });

  it("does not surface a birthday further than the recent-past lookback (4 days ago)", () => {
    const items = birthdaysToSurfaceInBrief([makePerson({ birthdate: "2010-08-26" })], new Date(2026, 7, 30));
    expect(items).toHaveLength(0);
  });

  it("skips archived people", () => {
    const items = birthdaysToSurfaceInBrief([makePerson({ is_archived: true, birthdate: "2010-08-30" })], new Date(2026, 7, 30));
    expect(items).toHaveLength(0);
  });
});

describe("birthdayLeadTimeLabel", () => {
  it("labels today, tomorrow, future, and past distinctly", () => {
    expect(birthdayLeadTimeLabel(0)).toBe("today");
    expect(birthdayLeadTimeLabel(1)).toBe("tomorrow");
    expect(birthdayLeadTimeLabel(30)).toBe("in 30 days");
    expect(birthdayLeadTimeLabel(-1)).toBe("yesterday");
    expect(birthdayLeadTimeLabel(-3)).toBe("3 days ago");
  });
});

describe("birthdayTitle", () => {
  it("includes the turning age when known", () => {
    const [item] = birthdaysInRange([makePerson()], new Date(2026, 7, 30), new Date(2026, 7, 30));
    expect(birthdayTitle(item)).toBe("Jack Smith turns 11");
  });

  it("falls back to a generic label when the birth year isn't known", () => {
    const [item] = birthdaysInRange(
      [makePerson({ birth_year_known: false })],
      new Date(2026, 7, 30),
      new Date(2026, 7, 30)
    );
    expect(birthdayTitle(item)).toBe("Jack Smith's birthday");
  });
});
