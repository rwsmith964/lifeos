// Zod schemas for every table's write payload (Phase 2, Section 3). These
// validate at the application boundary — API routes and engine code parse
// untrusted input (a form submission, an AI-generated suggestion) through
// the matching schema *before* calling the repository's `create`/`update`,
// which trusts its input is already well-typed. Keeping validation here
// rather than inside lib/db/repository.ts avoids double-validating on
// every call and keeps the generic CRUD factory free of per-table logic.
import { z } from "zod";

const uuid = z.uuid();
const isoDate = z.iso.date(); // YYYY-MM-DD
const isoDateTime = z.iso.datetime({ offset: true });
const cents = z.number().int().min(0);

export const householdRoleSchema = z.enum(["owner", "adult", "child", "viewer"]);

export const relationshipTypeSchema = z.enum([
  "self",
  "child",
  "spouse",
  "partner",
  "co_parent",
  "parent",
  "sibling",
  "extended_family",
  "friend",
  "colleague",
  "other",
]);

export const interestStrengthSchema = z.enum(["casual", "regular", "passionate"]);
export const interestSourceSchema = z.enum([
  "manual",
  "inferred_from_gift",
  "inferred_from_conversation",
]);
export const occasionTypeSchema = z.enum([
  "birthday",
  "christmas",
  "anniversary",
  "graduation",
  "just_because",
  "default",
]);
export const giftStatusSchema = z.enum(["idea", "chosen", "ordered", "delivered", "given"]);
export const giftReactionSchema = z.enum(["loved_it", "liked_it", "neutral", "missed"]);
export const priceTierSchema = z.enum(["low", "mid", "high"]);
export const suggestionStatusSchema = z.enum([
  "suggested",
  "saved",
  "dismissed",
  "converted_to_gift",
]);
export const contactTypeSchema = z.enum(["call", "text", "in_person", "activity", "other"]);
export const calendarEventTypeSchema = z.enum([
  "personal",
  "work",
  "family",
  "custody",
  "kid_activity",
  "prep",
  "travel",
]);
export const eventVisibilitySchema = z.enum(["private", "household", "shared_with_coparent"]);
export const attendanceStatusSchema = z.enum(["required", "optional", "informational"]);
export const custodyBlockTypeSchema = z.enum(["regular", "holiday", "swap", "vacation"]);
export const householdLinkStatusSchema = z.enum(["pending", "active", "revoked"]);
export const notificationChannelSchema = z.enum(["in_app", "email", "push", "sms"]);

export const householdInsertSchema = z.object({
  name: z.string().min(1),
  default_gift_budget_min_cents: cents.nullable().optional(),
  default_gift_budget_max_cents: cents.nullable().optional(),
  gift_scan_horizon_days: z.number().int().positive().optional(),
  gift_prompt_buffer_days: z.number().int().min(0).optional(),
  gift_handling_buffer_days: z.number().int().min(0).optional(),
  gift_personal_buffer_days: z.number().int().min(0).optional(),
  ai_daily_spend_ceiling_cents: cents.optional(),
  brief_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM 24-hour time")
    .optional(),
});

export const userInsertSchema = z.object({
  id: uuid,
  display_name: z.string().min(1),
  home_address: z.string().nullable().optional(),
  home_lat: z.number().min(-90).max(90).nullable().optional(),
  home_lng: z.number().min(-180).max(180).nullable().optional(),
  timezone: z.string().optional(),
});

export const householdMemberInsertSchema = z.object({
  household_id: uuid,
  user_id: uuid,
  role: householdRoleSchema.optional(),
});

export const householdLinkInsertSchema = z.object({
  household_a_id: uuid,
  household_b_id: uuid,
  status: householdLinkStatusSchema.optional(),
});

export const personInsertSchema = z.object({
  household_id: uuid,
  user_id: uuid.nullable().optional(),
  full_name: z.string().min(1),
  nickname: z.string().nullable().optional(),
  relationship_type: relationshipTypeSchema,
  birthdate: isoDate.nullable().optional(),
  birth_year_known: z.boolean().optional(),
  anniversary: isoDate.nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.email().nullable().optional(),
  photo_url: z.url().nullable().optional(),
  notes: z.string().optional(),
  is_archived: z.boolean().optional(),
});

export const personInterestInsertSchema = z.object({
  person_id: uuid,
  interest: z
    .string()
    .min(1)
    .transform((s) => s.toLowerCase().trim()),
  category: z.string().nullable().optional(),
  strength: interestStrengthSchema.optional(),
  source: interestSourceSchema.optional(),
  noted_at: isoDate.optional(),
});

export const personGiftBudgetInsertSchema = z
  .object({
    person_id: uuid,
    occasion_type: occasionTypeSchema.optional(),
    min_cents: cents,
    max_cents: cents,
  })
  .refine((v) => v.max_cents >= v.min_cents, {
    message: "max_cents must be >= min_cents",
    path: ["max_cents"],
  });

export const giftInsertSchema = z.object({
  person_id: uuid,
  given_by_person_id: uuid.nullable().optional(),
  occasion_type: occasionTypeSchema,
  occasion_date: isoDate,
  description: z.string().min(1),
  category: z.string().nullable().optional(),
  cost_cents: cents.nullable().optional(),
  status: giftStatusSchema.optional(),
  reaction: giftReactionSchema.nullable().optional(),
  product_url: z.url().nullable().optional(),
  notes: z.string().optional(),
});

export const giftSuggestionInsertSchema = z.object({
  person_id: uuid,
  occasion_type: occasionTypeSchema,
  occasion_date: isoDate,
  title: z.string().min(1),
  reasoning: z.string().min(1),
  price_tier: priceTierSchema,
  estimated_cost_cents: cents,
  product_url: z.url().nullable().optional(),
  retailer: z.string().nullable().optional(),
  order_by_date: isoDate,
  status: suggestionStatusSchema.optional(),
  model_version: z.string().min(1),
});

export const contactCadenceInsertSchema = z.object({
  person_id: uuid,
  target_interval_days: z.number().int().positive(),
  last_contact_date: isoDate.nullable().optional(),
  last_contact_type: contactTypeSchema.nullable().optional(),
  is_active: z.boolean().optional(),
});

export const interactionInsertSchema = z.object({
  person_id: uuid,
  interaction_type: contactTypeSchema,
  occurred_on: isoDate,
  notes: z.string().nullable().optional(),
  activity_id: uuid.nullable().optional(),
});

export const userActivityInsertSchema = z.object({
  household_id: uuid,
  person_id: uuid,
  activity_type: z.string().min(1),
  enjoyment_rank: z.number().int().min(1).max(10),
  typical_duration_minutes: z.number().int().positive(),
  requires_prep: z.boolean().optional(),
  prep_lead_time_hours: z.number().int().min(0).nullable().optional(),
  preferred_companions: z.array(uuid).optional(),
  is_active: z.boolean().optional(),
});

export const activityLocationInsertSchema = z.object({
  user_activity_id: uuid,
  name: z.string().min(1),
  address: z.string().nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  drive_time_minutes: z.number().int().min(0).nullable().optional(),
  notes: z.string().optional(),
  external_ids: z.record(z.string(), z.string()).optional(),
});

export const calendarEventInsertSchema = z
  .object({
    household_id: uuid,
    created_by_person_id: uuid,
    title: z.string().min(1),
    description: z.string().nullable().optional(),
    starts_at: isoDateTime,
    ends_at: isoDateTime,
    all_day: z.boolean().optional(),
    location: z.string().nullable().optional(),
    location_lat: z.number().min(-90).max(90).nullable().optional(),
    location_lng: z.number().min(-180).max(180).nullable().optional(),
    travel_time_before_minutes: z.number().int().min(0).nullable().optional(),
    prep_time_before_minutes: z.number().int().min(0).nullable().optional(),
    event_type: calendarEventTypeSchema.optional(),
    visibility: eventVisibilitySchema.optional(),
    external_source: z.string().nullable().optional(),
    external_id: z.string().nullable().optional(),
  })
  .refine((v) => new Date(v.ends_at) >= new Date(v.starts_at), {
    message: "ends_at must be >= starts_at",
    path: ["ends_at"],
  });

export const eventAttendeeInsertSchema = z.object({
  calendar_event_id: uuid,
  person_id: uuid,
  attendance_status: attendanceStatusSchema.optional(),
});

export const custodyBlockInsertSchema = z
  .object({
    household_id: uuid,
    child_person_id: uuid,
    responsible_person_id: uuid,
    starts_at: isoDateTime,
    ends_at: isoDateTime,
    block_type: custodyBlockTypeSchema.optional(),
    notes: z.string().optional(),
  })
  .refine((v) => new Date(v.ends_at) >= new Date(v.starts_at), {
    message: "ends_at must be >= starts_at",
    path: ["ends_at"],
  });

export const briefInsertSchema = z.object({
  household_id: uuid,
  for_person_id: uuid,
  brief_date: isoDate,
  content_json: z.unknown(),
  content_markdown: z.string(),
  delivered_channels: z.array(z.string()).optional(),
});

export const externalDataCacheInsertSchema = z.object({
  source: z.string().min(1),
  cache_key: z.string().min(1),
  payload: z.unknown(),
  expires_at: isoDateTime,
});

export const aiUsageLogInsertSchema = z.object({
  household_id: uuid,
  feature: z.string().min(1),
  model: z.string().min(1),
  input_tokens: z.number().int().min(0),
  output_tokens: z.number().int().min(0),
  estimated_cost_cents: z.number().min(0),
});

export const deviceTokenInsertSchema = z.object({
  user_id: uuid,
  platform: z.enum(["ios", "android", "web"]),
  token: z.string().min(1),
});

export const notificationInsertSchema = z.object({
  household_id: uuid,
  person_id: uuid,
  notification_type: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  link_path: z.string().nullable().optional(),
  channels: z.array(notificationChannelSchema).optional(),
});
