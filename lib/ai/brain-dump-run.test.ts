import { describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ callAi: vi.fn() }));

import { readBrainDumpReply } from "./brain-dump-run";

const event = (title: string, extra: Record<string, unknown> = {}) => ({
  type: "create_calendar_event",
  summary: `Add ${title}`,
  eventTitle: title,
  eventStartsAtISO: "2026-11-14T13:00:00",
  ...extra,
});

describe("readBrainDumpReply", () => {
  it("reads items that leave out their empty fields", () => {
    const result = readBrainDumpReply(JSON.stringify({ items: [event("Baby shower"), event("Pick up the kids")] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toHaveLength(2);
    expect(result.items[0].personId).toBeNull();
    expect(result.items[0].eventEndsAtISO).toBeNull();
    expect(result.items[0].workStartTime).toBeNull();
  });

  it("reads a reply wrapped in markdown fences or surrounded by prose", () => {
    const body = JSON.stringify({ items: [event("Sleepover")] });
    expect(readBrainDumpReply("```json\n" + body + "\n```").ok).toBe(true);
    const withProse = readBrainDumpReply("Here is the list you asked for:\n" + body + "\nLet me know!");
    expect(withProse.ok).toBe(true);
  });

  it("keeps a location and a multi-day end, and treats a missing location as none", () => {
    const stay = event("Brittney stays over", {
      eventStartsAtISO: "2026-11-14T16:30:00",
      eventEndsAtISO: "2026-11-15T09:30:00",
      eventLocation: "12 Oak Lane",
    });
    const result = readBrainDumpReply(JSON.stringify({ items: [stay, event("Plain")] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items[0].eventLocation).toBe("12 Oak Lane");
    expect(result.items[0].eventEndsAtISO).toBe("2026-11-15T09:30:00");
    expect(result.items[1].eventLocation).toBeNull();
  });

  it("turns an unrecognised label into null instead of dropping the whole item", () => {
    const result = readBrainDumpReply(JSON.stringify({ items: [event("Party", { eventType: "social_gathering" })] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toHaveLength(1);
    expect(result.items[0].eventType).toBeNull();
  });

  it("skips one broken item but keeps the rest", () => {
    const result = readBrainDumpReply(JSON.stringify({ items: [event("Good one"), { type: "nonsense", summary: "x" }, event("Another")] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items.map((i) => i.eventTitle)).toEqual(["Good one", "Another"]);
    expect(result.skipped).toBe(1);
  });

  it("accepts an empty list (nothing actionable)", () => {
    expect(readBrainDumpReply('{"items": []}')).toEqual({ ok: true, items: [], skipped: 0 });
  });

  it("fails clearly on text that is not JSON, a reply cut off mid-way, or all-invalid items", () => {
    expect(readBrainDumpReply("I could not find anything.").ok).toBe(false);
    expect(readBrainDumpReply('{"items": [{"type": "create_calendar_event", "summary": "Add').ok).toBe(false);
    expect(readBrainDumpReply(JSON.stringify({ items: [{ type: "bogus" }] })).ok).toBe(false);
  });
});
