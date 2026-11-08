import { describe, expect, it } from "vitest";
import { collectAttendeeNotes, deliveryFor, parseItinerary } from "./invite-plan";

describe("deliveryFor", () => {
  it("a household member needs no invitation", () => {
    expect(deliveryFor({ user_id: "u", linked_user_id: null, email: "a@b.c" })).toBe("member");
  });
  it("a connected account gets an in-app invitation", () => {
    expect(deliveryFor({ user_id: null, linked_user_id: "u", email: null })).toBe("linked");
  });
  it("someone with only an email is emailed", () => {
    expect(deliveryFor({ user_id: null, linked_user_id: null, email: "rusty@example.com" })).toBe("email");
  });
  it("someone with nothing can't be invited", () => {
    expect(deliveryFor({ user_id: null, linked_user_id: null, email: null })).toBe("none");
    expect(deliveryFor({ user_id: null, linked_user_id: null, email: "not-an-email" })).toBe("none");
  });
});

describe("parseItinerary", () => {
  it("keeps valid rows in clock order, untimed last", () => {
    const items = parseItinerary(
      JSON.stringify([
        { time: "", title: "Football on TV", notes: "" },
        { time: "17:00", title: "Dinner", notes: "Turkey" },
        { time: "14:00", title: "Arrive", notes: "" },
      ])
    );
    expect(items.map((i) => i.title)).toEqual(["Arrive", "Dinner", "Football on TV"]);
  });
  it("drops invalid rows and survives garbage", () => {
    expect(parseItinerary(JSON.stringify([{ time: "25:99", title: "Bad" }, { time: "10:00", title: "" }]))).toEqual([]);
    expect(parseItinerary("not json")).toEqual([]);
    expect(parseItinerary(null)).toEqual([]);
    expect(parseItinerary('{"a":1}')).toEqual([]);
  });
});

describe("collectAttendeeNotes", () => {
  it("collects non-empty per-person notes", () => {
    const notes = collectAttendeeNotes([
      ["title", "Thanksgiving"],
      ["note__abc", " bring pie "],
      ["note__def", "   "],
    ]);
    expect([...notes.entries()]).toEqual([["abc", "bring pie"]]);
  });
});
