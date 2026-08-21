import { describe, expect, it } from "vitest";
import {
  activityLocationInsertSchema,
  calendarEventInsertSchema,
  custodyBlockInsertSchema,
  giftInsertSchema,
  giftSuggestionInsertSchema,
  personGiftBudgetInsertSchema,
  personInsertSchema,
  personInterestInsertSchema,
  userActivityInsertSchema,
} from "./schemas";

// Real v4 UUIDs (version nibble 4, variant nibble in 8-b) — zod's z.uuid()
// enforces RFC 4122 shape, unlike Postgres's `uuid` column type which
// accepts any 32 hex digits. Seed data's readable literal ids (e.g.
// "30000000-...-000000000001") are fine for raw SQL but would fail this
// validator, which is correct: seed.sql never passes through Zod.
const PERSON_ID = "11111111-1111-4111-8111-111111111111";
const HOUSEHOLD_ID = "22222222-2222-4222-8222-222222222222";

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
