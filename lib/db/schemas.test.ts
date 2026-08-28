import { describe, expect, it } from "vitest";
import {
  activityLocationInsertSchema,
  calendarEventInsertSchema,
  custodyBlockInsertSchema,
  giftInsertSchema,
  giftSuggestionInsertSchema,
  personGiftBudgetInsertSchema,
  personGiftSiteInsertSchema,
  personInsertSchema,
  personInterestInsertSchema,
  timeOffEntryInsertSchema,
  tripIdeaInsertSchema,
  userActivityInsertSchema,
  workScheduleInsertSchema,
} from "./schemas";

const PERSON_ID = "11111111-1111-4111-8111-111111111111";
const HOUSEHOLD_ID = "22222222-2222-4222-8222-222222222222";
// Seed data's readable literal ids (e.g. "20000000-...-000000000001") don't
// carry a valid RFC 4122 version/variant nibble. seed.sql itself never
// passes through Zod, but these ids get read back out of the database and
// re-validated on every later create/update against the seeded household
// (e.g. household_id: household.id) — see DECISIONS.md D-031, where
// lib/db/schemas.ts's uuid schema switched from z.uuid() (RFC-strict,
// rejects these) to z.guid() (same shape Postgres's uuid column actually
// enforces) for exactly this reason.
const SEED_HOUSEHOLD_ID = "20000000-0000-0000-0000-000000000001";

describe("personInsertSchema", () => {
  it("accepts a minimal valid person", () => {
    const result = personInsertSchema.safeParse({
      household_id: HOUSEHOLD_ID,
      full_name: "Dave Wilson",
      relationship_type: "friend",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty full_name", () => {
    const result = personInsertSchema.safeParse({
      household_id: HOUSEHOLD_ID,
      full_name: "",
      relationship_type: "friend",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid relationship_type", () => {
    const result = personInsertSchema.safeParse({
      household_id: HOUSEHOLD_ID,
      full_name: "Dave Wilson",
      relationship_type: "best_friend_forever",
    });
    expect(result.success).toBe(false);
  });

  it("accepts the seeded demo household's non-RFC-4122 id (D-031 regression)", () => {
    const result = personInsertSchema.safeParse({
      household_id: SEED_HOUSEHOLD_ID,
      full_name: "Dave Wilson",
      relationship_type: "friend",
    });
    expect(result.success).toBe(true);
  });

  it("still rejects a non-UUID string", () => {
    const result = personInsertSchema.safeParse({
      household_id: "not-a-uuid",
      full_name: "Dave Wilson",
      relationship_type: "friend",
    });
    expect(result.success).toBe(false);
  });
});

describe("personInterestInsertSchema", () => {
  it("lowercases and trims the interest text", () => {
    const result = personInterestInsertSchema.parse({
      person_id: PERSON_ID,
      interest: "  Fly Fishing  ",
    });
    expect(result.interest).toBe("fly fishing");
  });
});

describe("personGiftBudgetInsertSchema", () => {
  it("rejects max_cents below min_cents", () => {
    const result = personGiftBudgetInsertSchema.safeParse({
      person_id: PERSON_ID,
      min_cents: 5000,
      max_cents: 1000,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid budget range", () => {
    const result = personGiftBudgetInsertSchema.safeParse({
      person_id: PERSON_ID,
      min_cents: 3000,
      max_cents: 7500,
    });
    expect(result.success).toBe(true);
  });
});

describe("personGiftSiteInsertSchema", () => {
  it("accepts a valid label and URL", () => {
    const result = personGiftSiteInsertSchema.safeParse({
      person_id: PERSON_ID,
      label: "Etsy",
      url: "https://www.etsy.com/shop/somefavoriteshop",
    });
    expect(result.success).toBe(true);
  });

  it("trims a whitespace-padded label", () => {
    const result = personGiftSiteInsertSchema.parse({
      person_id: PERSON_ID,
      label: "  Etsy  ",
      url: "https://www.etsy.com",
    });
    expect(result.label).toBe("Etsy");
  });

  it("rejects a whitespace-only label", () => {
    const result = personGiftSiteInsertSchema.safeParse({
      person_id: PERSON_ID,
      label: "   ",
      url: "https://www.etsy.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-URL string", () => {
    const result = personGiftSiteInsertSchema.safeParse({
      person_id: PERSON_ID,
      label: "Etsy",
      url: "not a url",
    });
    expect(result.success).toBe(false);
  });
});

describe("workScheduleInsertSchema", () => {
  it("accepts a valid weekday shift", () => {
    const result = workScheduleInsertSchema.safeParse({
      person_id: PERSON_ID,
      day_of_week: 3,
      start_time: "09:00",
      end_time: "17:00",
      label: "Work",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an end time before the start time", () => {
    const result = workScheduleInsertSchema.safeParse({
      person_id: PERSON_ID,
      day_of_week: 3,
      start_time: "17:00",
      end_time: "09:00",
      label: "Work",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a day_of_week outside 0-6", () => {
    const result = workScheduleInsertSchema.safeParse({
      person_id: PERSON_ID,
      day_of_week: 7,
      start_time: "09:00",
      end_time: "17:00",
      label: "Work",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed time string", () => {
    const result = workScheduleInsertSchema.safeParse({
      person_id: PERSON_ID,
      day_of_week: 3,
      start_time: "9am",
      end_time: "17:00",
      label: "Work",
    });
    expect(result.success).toBe(false);
  });
});

describe("timeOffEntryInsertSchema", () => {
  it("accepts a single-day entry", () => {
    const result = timeOffEntryInsertSchema.safeParse({
      person_id: PERSON_ID,
      start_date: "2026-09-04",
      end_date: "2026-09-04",
      reason: "Dentist",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a multi-day entry with no reason given", () => {
    const result = timeOffEntryInsertSchema.safeParse({
      person_id: PERSON_ID,
      start_date: "2026-09-04",
      end_date: "2026-09-08",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an end_date before the start_date", () => {
    const result = timeOffEntryInsertSchema.safeParse({
      person_id: PERSON_ID,
      start_date: "2026-09-08",
      end_date: "2026-09-04",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed date string", () => {
    const result = timeOffEntryInsertSchema.safeParse({
      person_id: PERSON_ID,
      start_date: "09/04/2026",
      end_date: "09/04/2026",
    });
    expect(result.success).toBe(false);
  });
});

describe("giftInsertSchema", () => {
  it("requires a non-empty description", () => {
    const result = giftInsertSchema.safeParse({
      person_id: PERSON_ID,
      occasion_type: "birthday",
      occasion_date: "2026-09-01",
      description: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("giftSuggestionInsertSchema", () => {
  it("accepts a full three-tier suggestion shape", () => {
    const result = giftSuggestionInsertSchema.safeParse({
      person_id: PERSON_ID,
      occasion_type: "birthday",
      occasion_date: "2026-09-01",
      title: "Fly tying kit",
      reasoning: "Dave has been tying his own flies for a year.",
      price_tier: "mid",
      estimated_cost_cents: 5500,
      order_by_date: "2026-08-25",
      model_version: "claude-sonnet-4-6",
    });
    expect(result.success).toBe(true);
  });
});

describe("calendarEventInsertSchema", () => {
  it("rejects ends_at before starts_at", () => {
    const result = calendarEventInsertSchema.safeParse({
      household_id: HOUSEHOLD_ID,
      created_by_person_id: PERSON_ID,
      title: "Golf",
      starts_at: "2026-09-01T12:00:00Z",
      ends_at: "2026-09-01T10:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid event", () => {
    const result = calendarEventInsertSchema.safeParse({
      household_id: HOUSEHOLD_ID,
      created_by_person_id: PERSON_ID,
      title: "Golf",
      starts_at: "2026-09-01T10:00:00Z",
      ends_at: "2026-09-01T12:00:00Z",
    });
    expect(result.success).toBe(true);
  });
});

describe("custodyBlockInsertSchema", () => {
  it("rejects ends_at before starts_at", () => {
    const result = custodyBlockInsertSchema.safeParse({
      household_id: HOUSEHOLD_ID,
      child_person_id: PERSON_ID,
      responsible_person_id: PERSON_ID,
      starts_at: "2026-09-06T17:00:00Z",
      ends_at: "2026-09-05T17:00:00Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("userActivityInsertSchema", () => {
  it("rejects enjoyment_rank outside 1-10", () => {
    const result = userActivityInsertSchema.safeParse({
      household_id: HOUSEHOLD_ID,
      person_id: PERSON_ID,
      activity_type: "golf",
      enjoyment_rank: 11,
      typical_duration_minutes: 240,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a typical + big-trip drive time where big-trip >= typical", () => {
    const result = userActivityInsertSchema.safeParse({
      household_id: HOUSEHOLD_ID,
      person_id: PERSON_ID,
      activity_type: "fishing",
      enjoyment_rank: 9,
      typical_duration_minutes: 180,
      typical_drive_minutes: 45,
      big_trip_max_drive_minutes: 90,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a big-trip drive time smaller than the typical drive time", () => {
    const result = userActivityInsertSchema.safeParse({
      household_id: HOUSEHOLD_ID,
      person_id: PERSON_ID,
      activity_type: "fishing",
      enjoyment_rank: 9,
      typical_duration_minutes: 180,
      typical_drive_minutes: 90,
      big_trip_max_drive_minutes: 45,
    });
    expect(result.success).toBe(false);
  });
});

describe("tripIdeaInsertSchema", () => {
  it("accepts a minimal trip idea with a title only", () => {
    const result = tripIdeaInsertSchema.safeParse({
      household_id: HOUSEHOLD_ID,
      created_by_person_id: PERSON_ID,
      title: "Alaska fishing trip",
    });
    expect(result.success).toBe(true);
  });

  it("accepts companions and a target timeframe", () => {
    const result = tripIdeaInsertSchema.safeParse({
      household_id: HOUSEHOLD_ID,
      created_by_person_id: PERSON_ID,
      title: "Alaska fishing trip",
      target_timeframe: "Summer 2027",
      companion_person_ids: [PERSON_ID],
      status: "idea",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a blank title", () => {
    const result = tripIdeaInsertSchema.safeParse({
      household_id: HOUSEHOLD_ID,
      created_by_person_id: PERSON_ID,
      title: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("activityLocationInsertSchema", () => {
  it("rejects latitude out of range", () => {
    const result = activityLocationInsertSchema.safeParse({
      user_activity_id: PERSON_ID,
      name: "Dexter Reservoir",
      lat: 200,
    });
    expect(result.success).toBe(false);
  });
});
