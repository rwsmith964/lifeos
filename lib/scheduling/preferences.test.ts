import { describe, expect, it } from "vitest";
import { createFakeSupabaseClient } from "../test-support/fake-supabase";
import {
  getResolvedSchedulingPreferences,
  isWithinQuietHours,
  resolvePreferences,
  saveSchedulingPreferences,
  sortByResponsePriority,
} from "./preferences";

const HOUSEHOLD_ID = "20000000-0000-0000-0000-000000000001";

describe("resolvePreferences", () => {
  it("returns all-default values when no row exists yet", () => {
    expect(resolvePreferences(null)).toEqual({
      quietHoursStart: null,
      quietHoursEnd: null,
      responsePriorityPersonIds: [],
      briefFraming: "balanced",
      preferredActivityWindows: [],
      scheduleReviewCadenceDays: null,
    });
  });

  it("maps every column from a real row", () => {
    const resolved = resolvePreferences({
      id: "pref-1",
      household_id: HOUSEHOLD_ID,
      quiet_hours_start: "21:00",
      quiet_hours_end: "07:00",
      response_priority_person_ids: ["p1", "p2"],
      brief_framing: "concise",
      preferred_activity_windows: [{ dayOfWeek: 6, startTime: "09:00", endTime: "12:00" }],
      schedule_review_cadence_days: 7,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });
    expect(resolved.quietHoursStart).toBe("21:00");
    expect(resolved.briefFraming).toBe("concise");
    expect(resolved.scheduleReviewCadenceDays).toBe(7);
  });
});

describe("getResolvedSchedulingPreferences", () => {
  it("reads through to the repository and resolves defaults for a household with no row", async () => {
    const { client } = createFakeSupabaseClient({ household_scheduling_preferences: { rows: [] } });
    const resolved = await getResolvedSchedulingPreferences(client as never, HOUSEHOLD_ID);
    expect(resolved.briefFraming).toBe("balanced");
    expect(resolved.responsePriorityPersonIds).toEqual([]);
  });
});

describe("saveSchedulingPreferences", () => {
  it("upserts on household_id so repeated saves never create duplicate rows", async () => {
    const { client, calls } = createFakeSupabaseClient({
      household_scheduling_preferences: {
        onUpsert: (values) => ({ id: "pref-1", ...values }),
      },
    });
    const row = await saveSchedulingPreferences(client as never, HOUSEHOLD_ID, { brief_framing: "detailed" });
    expect(row.brief_framing).toBe("detailed");
    expect(row.household_id).toBe(HOUSEHOLD_ID);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ table: "household_scheduling_preferences", op: "upsert" });
  });
});

describe("isWithinQuietHours", () => {
  const noQuietHours = { quietHoursStart: null, quietHoursEnd: null };
  const sameDayWindow = { quietHoursStart: "13:00", quietHoursEnd: "15:00" };
  const overnightWindow = { quietHoursStart: "21:00", quietHoursEnd: "07:00" };

  it("is always false when quiet hours are unset", () => {
    expect(isWithinQuietHours(noQuietHours, "22:00")).toBe(false);
  });

  it("detects a same-day window correctly at the boundaries", () => {
    expect(isWithinQuietHours(sameDayWindow, "12:59")).toBe(false);
    expect(isWithinQuietHours(sameDayWindow, "13:00")).toBe(true);
    expect(isWithinQuietHours(sameDayWindow, "14:59")).toBe(true);
    expect(isWithinQuietHours(sameDayWindow, "15:00")).toBe(false);
  });

  it("detects a window that wraps past midnight", () => {
    expect(isWithinQuietHours(overnightWindow, "23:00")).toBe(true);
    expect(isWithinQuietHours(overnightWindow, "03:00")).toBe(true);
    expect(isWithinQuietHours(overnightWindow, "07:00")).toBe(false);
    expect(isWithinQuietHours(overnightWindow, "12:00")).toBe(false);
  });

  it("treats a zero-width window (start === end) as no quiet hours, not always-quiet", () => {
    expect(isWithinQuietHours({ quietHoursStart: "09:00", quietHoursEnd: "09:00" }, "09:00")).toBe(false);
  });
});

describe("sortByResponsePriority", () => {
  it("orders explicitly prioritized people first, in preference order", () => {
    const result = sortByResponsePriority(["a", "b", "c"], ["c", "a"]);
    expect(result).toEqual(["c", "a", "b"]);
  });

  it("keeps original relative order for everyone not named in the preference", () => {
    const result = sortByResponsePriority(["a", "b", "c", "d"], []);
    expect(result).toEqual(["a", "b", "c", "d"]);
  });

  it("does not mutate the input array", () => {
    const input = ["a", "b"];
    sortByResponsePriority(input, ["b"]);
    expect(input).toEqual(["a", "b"]);
  });
});
