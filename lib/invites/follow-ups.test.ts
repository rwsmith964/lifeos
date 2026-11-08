import { describe, expect, it } from "vitest";
import { buildEventDescription, buildGiftNotes, buildInviteFollowUps, registryMeansNoGifts } from "./follow-ups";
import type { InviteExtraction } from "./extraction";

function invite(over: Partial<InviteExtraction> = {}): InviteExtraction {
  return {
    title: "Emma & Jake's Wedding",
    category: "wedding",
    date: "2027-06-12",
    startTime: "16:00",
    endTime: null,
    location: "Elk Rock Gardens",
    honoreeNames: ["Emma", "Jake"],
    hostNames: [],
    invitedNames: ["Richard"],
    rsvpBy: null,
    rsvpContact: null,
    registryInfo: null,
    registryUrl: null,
    dressCode: null,
    notes: null,
    yearInferred: false,
    ...over,
  };
}

describe("buildInviteFollowUps", () => {
  it("asks about a gift reminder for a wedding and mentions the registry when there is one", () => {
    const [q] = buildInviteFollowUps(invite({ registryInfo: "Registered at Crate & Barrel" }));
    expect(q.id).toBe("gift");
    expect(q.question).toContain("a wedding");
    expect(q.question).toContain("registry information");
  });

  it("still asks about a gift when no registry is printed, without promising registry info", () => {
    const [q] = buildInviteFollowUps(invite());
    expect(q.id).toBe("gift");
    expect(q.question).not.toContain("registry");
  });

  it("uses 'an' before a vowel sound", () => {
    const [q] = buildInviteFollowUps(invite({ category: "anniversary" }));
    expect(q.question).toContain("an anniversary party");
  });

  it("does not ask about a gift when the invitation says no gifts", () => {
    const qs = buildInviteFollowUps(invite({ registryInfo: "No gifts please, your presence is enough" }));
    expect(qs.find((q) => q.id === "gift")).toBeUndefined();
  });

  it("does not ask about a gift for an ordinary dinner", () => {
    expect(buildInviteFollowUps(invite({ category: "dinner" }))).toEqual([]);
  });

  it("offers an RSVP reminder only when there's an RSVP date", () => {
    const qs = buildInviteFollowUps(invite({ category: "dinner", rsvpBy: "2027-05-01", rsvpContact: "jake@example.com" }));
    expect(qs).toHaveLength(1);
    expect(qs[0]).toMatchObject({ id: "rsvp", detail: "RSVP to: jake@example.com" });
    expect(qs[0].question).toContain("May 1");
  });
});

describe("registryMeansNoGifts", () => {
  it("recognises common phrasings", () => {
    expect(registryMeansNoGifts("No gifts, please")).toBe(true);
    expect(registryMeansNoGifts("Gifts are not necessary")).toBe(true);
    expect(registryMeansNoGifts("Registered at Target")).toBe(false);
    expect(registryMeansNoGifts(null)).toBe(false);
  });
});

describe("text builders", () => {
  it("carries the registry into the gift notes", () => {
    const notes = buildGiftNotes(invite({ registryInfo: "Crate & Barrel", registryUrl: "https://example.com/emma-jake" }));
    expect(notes).toContain("Registry: Crate & Barrel");
    expect(notes).toContain("https://example.com/emma-jake");
    expect(notes).toContain("2027-06-12");
  });

  it("builds a description from the extras and is null when there are none", () => {
    expect(buildEventDescription(invite())).toBeNull();
    const d = buildEventDescription(invite({ dressCode: "Black tie", hostNames: ["The Millers"] }));
    expect(d).toContain("Hosted by The Millers");
    expect(d).toContain("Dress code: Black tie");
  });
});
