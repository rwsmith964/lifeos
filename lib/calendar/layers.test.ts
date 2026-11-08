import { describe, expect, it } from "vitest";
import { eventLayerFor, parseLayers, serializeLayers, toggleLayer } from "./layers";

describe("parseLayers", () => {
  it("defaults to just birthdays on", () => {
    expect([...parseLayers(undefined, null)]).toEqual(["birthdays"]);
  });
  it("an explicit param wins over the remembered cookie", () => {
    expect([...parseLayers("school", "custody")]).toEqual(["school"]);
  });
  it("falls back to the cookie", () => {
    expect([...parseLayers(undefined, "custody,school")].sort()).toEqual(["custody", "school"]);
  });
  it("'none' means everything optional is off, not 'use the defaults'", () => {
    expect(parseLayers("none", null).size).toBe(0);
    expect(parseLayers(undefined, "none").size).toBe(0);
  });
  it("ignores unknown layer names", () => {
    expect([...parseLayers("school,bogus", null)]).toEqual(["school"]);
  });
});

describe("serializeLayers / toggleLayer", () => {
  it("round-trips in a stable order", () => {
    expect(serializeLayers(new Set(["school", "custody"]))).toBe("custody,school");
    expect(serializeLayers(new Set())).toBe("none");
  });
  it("toggles on and off without mutating the original", () => {
    const base = new Set<"birthdays" | "school">(["birthdays"]);
    const on = toggleLayer(base, "school");
    expect(on.has("school")).toBe(true);
    expect(base.has("school")).toBe(false);
    expect(toggleLayer(on, "school").has("school")).toBe(false);
  });
});

describe("eventLayerFor", () => {
  const base = {
    selfPersonId: "me",
    createdByPersonId: "me",
    attendeePersonIds: [] as string[],
    childPersonIds: new Set(["cal"]),
    passesKidEventRule: true,
  };

  it("an event with no attendees is mine when I made it", () => {
    expect(eventLayerFor(base)).toBe("mine");
  });
  it("an event I made for other people is still mine", () => {
    expect(eventLayerFor({ ...base, attendeePersonIds: ["mel"] })).toBe("mine");
  });
  it("an event with no attendees is the family's when someone else made it", () => {
    expect(eventLayerFor({ ...base, createdByPersonId: "mel" })).toBe("family");
  });
  it("is mine when I attend", () => {
    expect(eventLayerFor({ ...base, createdByPersonId: "mel", attendeePersonIds: ["me", "mel"] })).toBe("mine");
  });
  it("a kid's event is mine on my days", () => {
    expect(eventLayerFor({ ...base, createdByPersonId: "mel", attendeePersonIds: ["cal"] })).toBe("mine");
  });
  it("a kid's event on the other parent's day is not mine", () => {
    expect(eventLayerFor({ ...base, attendeePersonIds: ["cal"], passesKidEventRule: false })).toBe("family");
  });
  it("someone else's plans are the family's", () => {
    expect(eventLayerFor({ ...base, createdByPersonId: "mel", attendeePersonIds: ["mel"] })).toBe("family");
  });
});
