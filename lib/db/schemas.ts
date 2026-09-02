// Zod schemas for every table's write payload (Phase 2, Section 3). These
// validate at the application boundary — API routes and engine code parse
// untrusted input (a form submission, an AI-generated suggestion) through
// the matching schema *before* calling the repository's `create`/`update`,
// which trusts its input is already well-typed. Keeping validation here
// rather than inside lib/db/repository.ts avoids double-validating on
// every call and keeps the generic CRUD factory free of per-table logic.
import { z } from "zod";
import { isValidTimezone } from "@/lib/timezones";

// z.uuid() validates strict RFC 4122 version/variant bits and rejects
// anything else with the message "Invalid UUID" — including this project's
// own seed data (household/person ids like 20000000-0000-0000-0000-…001),
// which Postgres's `uuid` column type accepts without complaint since it
// has no such requirement. Every create/update against the seeded demo
// household failed validation here before it ever reached the database —
// this was THE literal "Invalid UUID" bug (see DECISIONS.md D-031).
// z.guid() checks the same 8-4-4-4-12 hex shape Postgres does, without the
// version/variant constraint, so it accepts both real gen_random_uuid()
// output and the seed data's hand-assigned ids.
const uuid = z.guid();
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
  "ordered",
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
  "external",
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
  // P3-5: only email/push are ever submitted from Settings (in_app is
  // always-on application logic, sms is deferred and not exposed) — but
  // this schema doesn't restrict beyond the enum since the dispatcher
  // itself already no-ops safely on any channel it doesn't implement yet.
  notification_channels: z.array(notificationChannelSchema).optional(),
  calendar_hide_other_parent_custody: z.boolean().optional(),
});

export const userInsertSchema = z.object({
  id: uuid,
  display_name: z.string().min(1),
  home_address: z.string().nullable().optional(),
  home_lat: z.number().min(-90).max(90).nullable().optional(),
  home_lng: z.number().min(-180).max(180).nullable().optional(),
  // Was a free-text field (Phase 3 backlog) — the settings form now
  // submits from a constrained <select> of real IANA zones, and this
  // refine rejects anything else server-side too (defense in depth
  // against a direct API call bypassing the UI).
  timezone: z.string().refine(isValidTimezone, { message: "Not a recognized timezone." }).optional(),
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

// 'owner' and 'child' deliberately excluded — see the check constraint's
// comment in 20260827000001_household_invites.sql for why.
export const householdInviteRoleSchema = z.enum(["adult", "viewer"]);

export const householdInviteInsertSchema = z.object({
  invited_email: z.string().trim().toLowerCase().email({ message: "Enter a valid email address." }),
  role: householdInviteRoleSchema,
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
  is_childcare_provider: z.boolean().optional(),
  address: z.string().nullable().optional(),
  address_lat: z.number().min(-90).max(90).nullable().optional(),
  address_lng: z.number().min(-180).max(180).nullable().optional(),
  show_work_schedule_on_calendar: z.boolean().optional(),
});

export const personInterestInsertSchema = z.object({
  person_id: uuid,
  // .trim()/.toLowerCase() must run BEFORE .min(1): with the old
  // ordering (.min(1).transform(trim+lowercase)) a whitespace-only
  // string like "   " passed the length check first (length 3 >= 1)
  // and only got reduced to an empty string afterward at insert time —
  // saving a permanently blank, unremovable interest chip. Chaining
  // .trim().toLowerCase() before .min(1) makes the length check run
  // against the already-normalized value, so whitespace-only input is
  // correctly rejected instead of silently persisted.
  interest: z.string().trim().toLowerCase().min(1, "Interest can't be empty."),
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
    message: "Max must be at least the minimum.",
    path: ["max_cents"],
  });

export const personGiftSiteInsertSchema = z.object({
  person_id: uuid,
  // .trim() before .min(1) for the same reason as personInterestInsertSchema
  // above -- a whitespace-only label must fail length validation, not pass
  // it and get silently blanked by a later transform.
  label: z.string().trim().min(1, "Give this site a short label.").max(60, "Keep the label under 60 characters."),
  url: z.url({ message: "Enter a valid URL, including https://" }),
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
  category: z.string().nullable().optional(),
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

// Base shape without .refine() so both the insert and update variants can
// still use .omit() below (a Zod object loses .omit() once .refine() has
// been applied to it).
const userActivityBaseSchema = z.object({
  household_id: uuid,
  person_id: uuid,
  activity_type: z.string().min(1),
  enjoyment_rank: z.number().int().min(1).max(10),
  // The form's own input declares `min={15}` as the shortest sensible
  // activity duration, but the server schema only required `.positive()`
  // — so any client that skips or bypasses the native HTML min attribute
  // (a different browser, a direct API call, JS manipulation) could
  // silently persist e.g. a 5-minute "typical duration" with no error at
  // all. Aligning the schema with the UI's own stated minimum closes
  // that gap.
  typical_duration_minutes: z.number().int().min(15, "Typical duration must be at least 15 minutes."),
  requires_prep: z.boolean().optional(),
  prep_lead_time_hours: z.number().int().min(0).nullable().optional(),
  preferred_companions: z.array(uuid).optional(),
  // D-059: drive-time willingness. typical = normal max for a routine
  // outing; big_trip_max = how far they'd go for an exceptional outing.
  typical_drive_minutes: z.number().int().min(0).nullable().optional(),
  big_trip_max_drive_minutes: z.number().int().min(0).nullable().optional(),
  // D-083 (P3-1): set automatically when an opportunity for this activity
  // is marked "Acted on", or manually here on the edit form.
  last_done_at: isoDate.nullable().optional(),
  // D-085 (P3-3): season window (1-12 inclusive) -- both set or both left
  // blank for year-round (see withSeasonWindowRefinement below).
  season_start_month: z.number().int().min(1).max(12).nullable().optional(),
  season_end_month: z.number().int().min(1).max(12).nullable().optional(),
  needs_daylight: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

// When both drive-time fields are set, the big-trip max must be at least
// the typical one — otherwise "bigger trip" tolerance would be smaller
// than the routine tolerance, which doesn't make sense.
function withDriveTimeOrderRefinement<
  T extends z.ZodType<{ typical_drive_minutes?: number | null; big_trip_max_drive_minutes?: number | null }>
>(schema: T) {
  return schema.refine(
    (v) =>
      v.typical_drive_minutes == null ||
      v.big_trip_max_drive_minutes == null ||
      v.big_trip_max_drive_minutes >= v.typical_drive_minutes,
    {
      message: "The bigger-trip max drive time must be at least the typical drive time.",
      path: ["big_trip_max_drive_minutes"],
    }
  );
}

// A season window only makes sense as a pair -- "starts in March" with no
// end month (or vice versa) is ambiguous, so require both or neither,
// mirroring the drive-time-order refinement's shape just above.
function withSeasonWindowRefinement<
  T extends z.ZodType<{ season_start_month?: number | null; season_end_month?: number | null }>
>(schema: T) {
  return schema.refine((v) => (v.season_start_month == null) === (v.season_end_month == null), {
    message: "Set both a start and end month for the season window, or leave both blank for year-round.",
    path: ["season_end_month"],
  });
}

export const userActivityInsertSchema = withSeasonWindowRefinement(
  withDriveTimeOrderRefinement(userActivityBaseSchema)
);

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

// Update variants (D-056): same field rules as insert, but household_id
// and person_id are immutable once created (an activity doesn't change
// which household or person it belongs to via an edit form), so those
// two keys are omitted rather than made optional-but-editable.
export const userActivityUpdateSchema = withSeasonWindowRefinement(
  withDriveTimeOrderRefinement(
    userActivityBaseSchema.omit({
      household_id: true,
      person_id: true,
    })
  )
);

export const activityLocationUpdateSchema = activityLocationInsertSchema.omit({
  user_activity_id: true,
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
    related_activity_id: uuid.nullable().optional(),
  })
  .refine((v) => new Date(v.ends_at) >= new Date(v.starts_at), {
    message: "End time must be after the start time.",
    path: ["ends_at"],
  });

// P3-6: a household's connected Google Calendar/iCal feed. `feed_url` is
// the only thing a person actually types in; the rest are sync bookkeeping
// the server writes.
export const calendarFeedInsertSchema = z.object({
  household_id: uuid,
  created_by_person_id: uuid,
  label: z.string().trim().min(1, "Give this calendar a name.").max(80),
  feed_url: z
    .string()
    .trim()
    .url("Enter a valid calendar URL.")
    .refine((v) => v.startsWith("https://") || v.startsWith("http://"), {
      message: "The calendar URL must start with http:// or https://.",
    }),
});

// D-056: household_id/created_by_person_id are immutable on edit (same
// rationale as userActivityUpdateSchema above); the refine() rule still
// needs re-declaring since .omit() on a ZodEffects isn't available —
// simplest to redeclare the object shape directly.
export const calendarEventUpdateSchema = z
  .object({
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
    related_activity_id: uuid.nullable().optional(),
  })
  .refine((v) => new Date(v.ends_at) >= new Date(v.starts_at), {
    message: "End time must be after the start time.",
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
    location: z.string().nullable().optional(),
    custody_schedule_id: uuid.nullable().optional(),
  })
  .refine((v) => new Date(v.ends_at) >= new Date(v.starts_at), {
    message: "End date can't be before the start date.",
    path: ["ends_at"],
  });

// D-097: edit for a one-off custody block only (custody_schedule_id left
// out entirely — a schedule-generated block's fields get overwritten the
// next time its schedule re-materializes, so this update path is only
// ever reached from the one-off edit form/route, which already checks
// custody_schedule_id is null before allowing the edit).
export const custodyBlockUpdateSchema = z
  .object({
    child_person_id: uuid,
    responsible_person_id: uuid,
    starts_at: isoDateTime,
    ends_at: isoDateTime,
    block_type: custodyBlockTypeSchema.optional(),
    notes: z.string().optional(),
    location: z.string().nullable().optional(),
  })
  .refine((v) => new Date(v.ends_at) >= new Date(v.starts_at), {
    message: "End date can't be before the start date.",
    path: ["ends_at"],
  });

const custodyCycleAssignmentSchema = z.object({
  dayIndex: z.number().int().min(0),
  responsiblePersonId: uuid,
});

const handoverTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM 24-hour time");

// A day-of-week + clock-time breakpoint for the 'weekly_segments'
// recurrence type — see migration 20260902000001 and
// lib/custody/schedule.ts projectWeeklySegmentSchedule.
const custodyWeeklySegmentSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  time: handoverTimeSchema,
  responsiblePersonId: uuid,
});

// A custody schedule is either a repeating N-day 'cycle' (the original
// engine — one responsible parent per whole calendar day) or a fixed
// 'weekly_segments' pattern (a list of day-of-week + time breakpoints,
// which is what lets a single calendar day split between two people at
// an exact handover time). The two recurrence types are mutually
// exclusive by construction below: a 'cycle' schedule never carries
// weekly_segments and a 'weekly_segments' schedule never carries the
// cycle fields, matching the DB check constraint
// custody_schedules_recurrence_fields_check.
const custodyScheduleCycleSchema = z.object({
  household_id: uuid,
  child_person_id: uuid,
  name: z.string().optional(),
  recurrence_type: z.literal("cycle").optional(),
  cycle_length_days: z.number().int().min(1).max(90),
  cycle_assignments: z.array(custodyCycleAssignmentSchema).min(1),
  anchor_date: isoDate,
  handover_time: handoverTimeSchema.optional(),
  handover_location: z.string().nullable().optional(),
  // Optional per-dayIndex handover time override (see migration
  // 20260830000001). Keys are stringified dayIndex, e.g. "5".
  custom_handover_times: z.record(z.string(), handoverTimeSchema).nullable().optional(),
  weekly_segments: z.null().optional(),
  start_date: isoDate,
  end_date: isoDate.nullable().optional(),
  notes: z.string().optional(),
});

const custodyScheduleWeeklySegmentsSchema = z.object({
  household_id: uuid,
  child_person_id: uuid,
  name: z.string().optional(),
  recurrence_type: z.literal("weekly_segments"),
  cycle_length_days: z.null().optional(),
  cycle_assignments: z.null().optional(),
  anchor_date: z.null().optional(),
  handover_time: handoverTimeSchema.optional(),
  handover_location: z.string().nullable().optional(),
  custom_handover_times: z.null().optional(),
  weekly_segments: z.array(custodyWeeklySegmentSchema).min(1),
  start_date: isoDate,
  end_date: isoDate.nullable().optional(),
  notes: z.string().optional(),
});

// Shared refinements, applied identically to the create (with
// household_id/child_person_id) and update (without — those are
// immutable) variants below. Kept as plain functions rather than chained
// on a shared base schema because z.ZodObject.omit() isn't available
// once .refine() has already wrapped the schema in a ZodEffects. Each
// generic is constrained to the concrete output shape it reads from, so
// property access below is fully typed instead of falling back to
// z.infer<T> (which loses field information across the generic
// boundary — this was a fixed bug from an earlier attempt).
interface CycleRuleShape {
  cycle_assignments: { dayIndex: number; responsiblePersonId: string }[];
  cycle_length_days: number;
  custom_handover_times?: Record<string, string> | null;
  start_date: string;
  end_date?: string | null;
}

function refineCycleRules<T extends z.ZodType<CycleRuleShape>>(schema: T) {
  return schema
    .refine((v) => v.cycle_assignments.every((a) => a.dayIndex < v.cycle_length_days), {
      message: "Every cycle day must be within the cycle length.",
      path: ["cycle_assignments"],
    })
    .refine(
      (v) =>
        !v.custom_handover_times ||
        Object.keys(v.custom_handover_times).every((key) => Number.isInteger(Number(key)) && Number(key) < v.cycle_length_days),
      { message: "Every handover-time override must be within the cycle length.", path: ["custom_handover_times"] }
    )
    .refine((v) => !v.end_date || v.end_date >= v.start_date, {
      message: "End date can't be before the start date.",
      path: ["end_date"],
    });
}

interface WeeklySegmentsRuleShape {
  weekly_segments: { dayOfWeek: number; time: string; responsiblePersonId: string }[];
  start_date: string;
  end_date?: string | null;
}

function refineWeeklySegmentsRules<T extends z.ZodType<WeeklySegmentsRuleShape>>(schema: T) {
  return schema
    .refine(
      (v) => {
        const seen = new Set(v.weekly_segments.map((s) => `${s.dayOfWeek}-${s.time}`));
        return seen.size === v.weekly_segments.length;
      },
      { message: "Two handoffs can't start at the same day and time.", path: ["weekly_segments"] }
    )
    .refine((v) => !v.end_date || v.end_date >= v.start_date, {
      message: "End date can't be before the start date.",
      path: ["end_date"],
    });
}

function withDefaultRecurrenceType<T extends z.ZodType<{ recurrence_type?: string }>>(schema: T) {
  return schema.transform((v) => ({
    ...v,
    recurrence_type: v.recurrence_type ?? "cycle",
  }));
}

export const custodyScheduleInsertSchema = withDefaultRecurrenceType(
  z.union([refineCycleRules(custodyScheduleCycleSchema), refineWeeklySegmentsRules(custodyScheduleWeeklySegmentsSchema)])
);
export type CustodyScheduleInsertInput = z.infer<typeof custodyScheduleInsertSchema>;

// Whole-schedule edit (PATCH /api/calendar/custody/schedules/[id]) — same
// shape as create, minus the immutable household_id/child_person_id. A
// full replace of the recurring definition, re-materialized after saving.
export const custodyScheduleUpdateSchema = withDefaultRecurrenceType(
  z.union([
    refineCycleRules(custodyScheduleCycleSchema.omit({ household_id: true, child_person_id: true })),
    refineWeeklySegmentsRules(custodyScheduleWeeklySegmentsSchema.omit({ household_id: true, child_person_id: true })),
  ])
);
export type CustodyScheduleUpdateInput = z.infer<typeof custodyScheduleUpdateSchema>;

export const custodyScheduleExceptionInsertSchema = z.object({
  custody_schedule_id: uuid,
  exception_date: isoDate,
  responsible_person_id: uuid,
  reason: z.string().optional(),
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

// trip_ideas (D-059) ------------------------------------------------------

export const tripIdeaStatusSchema = z.enum(["idea", "planned", "booked", "done", "abandoned"]);

export const tripIdeaInsertSchema = z.object({
  household_id: uuid,
  created_by_person_id: uuid,
  title: z.string().min(1, "Give this trip idea a name."),
  activity_type: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  target_timeframe: z.string().nullable().optional(),
  companion_person_ids: z.array(uuid).optional(),
  status: tripIdeaStatusSchema.optional(),
});

export const tripIdeaUpdateSchema = tripIdeaInsertSchema.omit({
  household_id: true,
  created_by_person_id: true,
});

// childcare_requests (D-060) ----------------------------------------------

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM 24-hour time");

export const childcareRequestStatusSchema = z.enum([
  "pending",
  "accepted",
  "declined",
  "cancelled",
  "expired",
]);

const childcareRequestBaseSchema = z.object({
  household_id: uuid,
  requested_by_person_id: uuid,
  provider_person_id: uuid,
  child_person_ids: z.array(uuid).min(1, "Pick at least one child this request covers."),
  care_date: isoDate,
  care_start_time: timeOfDay,
  care_end_time: timeOfDay,
  event_title: z.string().nullable().optional(),
  custom_note: z.string().nullable().optional(),
  status: childcareRequestStatusSchema.optional(),
  drive_minutes_to_provider: z.number().int().min(0).nullable().optional(),
  drive_time_source: z.string().nullable().optional(),
  expires_at: isoDateTime,
});

// Same .refine()-doesn't-compose-with-.omit() constraint as
// withDriveTimeOrderRefinement above — a shared helper so both the insert
// and update variants get the same cross-field check.
function withCareTimeOrderRefinement<
  T extends z.ZodType<{ care_start_time: string; care_end_time: string }>
>(schema: T) {
  return schema.refine((v) => v.care_end_time > v.care_start_time, {
    message: "Care end time must be after the start time.",
    path: ["care_end_time"],
  });
}

export const childcareRequestInsertSchema = withCareTimeOrderRefinement(childcareRequestBaseSchema);

export const childcareRequestUpdateSchema = withCareTimeOrderRefinement(
  childcareRequestBaseSchema.omit({
    household_id: true,
    requested_by_person_id: true,
    provider_person_id: true,
  })
);

// work_schedules + time_off_entries (D-064) --------------------------------

export const workScheduleInsertSchema = z.object({
  person_id: uuid,
  day_of_week: z.number().int().min(0, "Pick a day of the week.").max(6, "Pick a day of the week."),
  start_time: timeOfDay,
  end_time: timeOfDay,
  // .trim() before .min(1) for the same reason as personGiftSiteInsertSchema
  // above -- a whitespace-only label must fail length validation.
  label: z.string().trim().min(1, "Give this shift a short label.").max(40, "Keep the label under 40 characters."),
}).refine((v) => v.end_time > v.start_time, {
  message: "End time must be after the start time.",
  path: ["end_time"],
});

export const timeOffEntryInsertSchema = z.object({
  person_id: uuid,
  start_date: isoDate,
  end_date: isoDate,
  reason: z.string().trim().max(80, "Keep the reason under 80 characters.").optional().default(""),
  source: z.enum(["manual", "quick_capture"]).optional().default("manual"),
}).refine((v) => v.end_date >= v.start_date, {
  message: "End date can't be before the start date.",
  path: ["end_date"],
});

// child_activities + child_activity_attendance (D-129) ----------------------

export const childActivityInsertSchema = z.object({
  household_id: uuid,
  child_person_id: uuid,
  name: z.string().trim().min(1, "Give this activity a name.").max(80, "Keep the name under 80 characters."),
  activity_type: z.string().trim().max(40).optional().nullable(),
  day_of_week: z.number().int().min(0, "Pick a day of the week.").max(6, "Pick a day of the week."),
  start_time: timeOfDay,
  end_time: timeOfDay,
  location_name: z.string().trim().max(120).optional().nullable(),
  location_address: z.string().trim().max(200).optional().nullable(),
  location_lat: z.number().min(-90).max(90).optional().nullable(),
  location_lng: z.number().min(-180).max(180).optional().nullable(),
  drive_time_minutes: z.number().int().min(0).optional().nullable(),
  notes: z.string().trim().max(500).optional().default(""),
  is_active: z.boolean().optional().default(true),
}).refine((v) => v.end_time > v.start_time, {
  message: "End time must be after the start time.",
  path: ["end_time"],
});

export const childActivityAttendanceEntrySchema = z.object({
  person_id: uuid,
  attendance_status: attendanceStatusSchema,
});

// Module 1: Relationship & Gift Engine (D-117, relationship_gift_engine_v2 flag) ---

export const wishlistItemSourceSchema = z.enum(["manual", "conversation_log"]);
export const conversationLogSourceSchema = z.enum(["manual", "overheard", "inferred"]);
export const reciprocityDirectionSchema = z.enum(["given_to_them", "received_from_them"]);
export const giftPipelineStageSchema = z.enum([
  "idea",
  "shortlisted",
  "decided",
  "ordered",
  "shipped",
  "arrived",
  "given",
]);

export const personProfileDetailsInsertSchema = z.object({
  person_id: uuid,
  food_preferences: z.string().trim().max(2000).nullable(),
  clothing_size: z.string().trim().max(200).nullable(),
  shoe_size: z.string().trim().max(200).nullable(),
  ring_size: z.string().trim().max(200).nullable(),
  preferred_brands: z.string().trim().max(2000).nullable(),
  how_we_met: z.string().trim().max(2000).nullable(),
});

export const personWishlistItemInsertSchema = z.object({
  person_id: uuid,
  // .trim() before .min(1) for the same reason as personInterestInsertSchema above.
  item: z.string().trim().min(1, "Describe what they want.").max(300, "Keep this under 300 characters."),
  source: wishlistItemSourceSchema.optional(),
  noted_at: isoDate.optional(),
  is_active: z.boolean().optional(),
});

export const personRelationshipInsertSchema = z.object({
  person_id: uuid,
  related_person_id: uuid.nullable().optional(),
  related_name: z.string().trim().min(1, "Enter a name.").max(120, "Keep the name under 120 characters."),
  relation_label: z.string().trim().min(1, "Describe how they're related (e.g. \"wife\", \"son\").").max(60, "Keep this under 60 characters."),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const conversationLogEntryInsertSchema = z.object({
  person_id: uuid,
  entry_date: isoDate.optional(),
  content: z.string().trim().min(1, "Enter what was said.").max(4000, "Keep this under 4000 characters."),
  source: conversationLogSourceSchema.optional(),
  logged_by_person_id: uuid.nullable().optional(),
});

export const momentInsertSchema = z.object({
  household_id: uuid,
  title: z.string().trim().min(1, "Give this moment a title.").max(200, "Keep the title under 200 characters."),
  occurred_on: isoDate,
  place: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  participant_person_ids: z.array(uuid).optional(),
  created_by_person_id: uuid.nullable().optional(),
});

export const giftReciprocityEntryInsertSchema = z
  .object({
    household_id: uuid,
    person_id: uuid,
    direction: reciprocityDirectionSchema,
    description: z.string().trim().min(1, "Describe the gift.").max(300, "Keep this under 300 characters."),
    occasion_type: occasionTypeSchema.nullable().optional(),
    occurred_on: isoDate.nullable().optional(),
    is_promise: z.boolean().optional(),
    promise_due_date: isoDate.nullable().optional(),
    fulfilled_at: isoDate.nullable().optional(),
  })
  .refine((v) => !v.promise_due_date || v.is_promise, {
    message: "A due date only makes sense for an outstanding promise.",
    path: ["promise_due_date"],
  });

// Module 2 (leisure_planner_v2, D-118) ----------------------------------------

/** Normalizes a free-text activity_type label into the key used to join it
 * to a viability config or a type-level gear checklist default -- lower/trim
 * only, no other transformation, so "Golf" and "golf" collapse to one key
 * but distinct types never accidentally collide. */
export function activityTypeKey(activityType: string): string {
  return activityType.trim().toLowerCase();
}

export const activityTypeViabilityConfigInsertSchema = z.object({
  household_id: uuid,
  activity_type_key: z
    .string()
    .trim()
    .min(1, "Enter the activity type this applies to.")
    .max(100, "Keep this under 100 characters.")
    .transform((v) => v.toLowerCase()),
  relevant_inputs: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const gearChecklistItemInsertSchema = z
  .object({
    household_id: uuid,
    user_activity_id: uuid.nullable().optional(),
    activity_type_key: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .transform((v) => v.toLowerCase())
      .nullable()
      .optional(),
    item_label: z.string().trim().min(1, "Describe the gear item.").max(200, "Keep this under 200 characters."),
    sort_order: z.number().int().optional(),
  })
  .refine((v) => Boolean(v.user_activity_id) !== Boolean(v.activity_type_key), {
    message: "Pick either a specific activity or an activity type, not both or neither.",
    path: ["user_activity_id"],
  });

export const leisureOutingLogInsertSchema = z.object({
  household_id: uuid,
  user_activity_id: uuid,
  occurred_on: isoDate,
  conditions_notes: z.string().trim().max(2000).nullable().optional(),
  companions_person_ids: z.array(uuid).optional(),
  rating: z.number().int().min(1, "Rating must be between 1 and 5.").max(5, "Rating must be between 1 and 5.").nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  gear_items_packed: z.array(uuid).optional(),
  moment_id: uuid.nullable().optional(),
  created_by_person_id: uuid.nullable().optional(),
});

// Module 3 (universal_intake_v2, D-119) --------------------------------

export const intakeSourceTypeSchema = z.enum(["text", "voice", "ics", "image", "screenshot", "pdf", "email"]);
export const intakeParserSchema = z.enum(["generic", "activity_schedule", "school_flyer", "ics"]);
export const intakeRecordTypeSchema = z.enum([
  "calendar_event",
  "gift_idea",
  "person",
  "moment",
  "person_note",
  "task",
  "ambiguous",
]);
export const intakeDraftStatusSchema = z.enum(["pending", "needs_review", "ready", "converted", "rejected"]);

// One entry per extracted field -- {"value": ..., "confidence": 0-1}.
// `value` is deliberately `z.unknown()` since a field's shape depends on
// detected_record_type (a date string for an event, a dollar number for a
// gift budget, etc.) -- lib/intake/convert.ts is what actually narrows
// each field against the target record type before writing anything.
export const intakeFieldSchema = z.object({
  value: z.unknown(),
  confidence: z.number().min(0).max(1),
});

export const intakeDraftInsertSchema = z.object({
  household_id: uuid,
  created_by_person_id: uuid.nullable().optional(),
  source_type: intakeSourceTypeSchema,
  parser_used: intakeParserSchema.optional(),
  detected_record_type: intakeRecordTypeSchema.nullable().optional(),
  extracted_fields: z.record(z.string(), intakeFieldSchema).optional(),
  overall_confidence: z.number().min(0).max(1).nullable().optional(),
  source_excerpt: z.string().trim().max(4000).nullable().optional(),
  status: intakeDraftStatusSchema.optional(),
  review_note: z.string().trim().max(2000).nullable().optional(),
  converted_table: z.string().nullable().optional(),
  converted_record_id: uuid.nullable().optional(),
  parsed_at: isoDateTime.optional(),
});

export const intakeDraftUpdateSchema = z.object({
  detected_record_type: intakeRecordTypeSchema.nullable().optional(),
  extracted_fields: z.record(z.string(), intakeFieldSchema).optional(),
  overall_confidence: z.number().min(0).max(1).nullable().optional(),
  status: intakeDraftStatusSchema.optional(),
  review_note: z.string().trim().max(2000).nullable().optional(),
  converted_table: z.string().nullable().optional(),
  converted_record_id: uuid.nullable().optional(),
});

// Request body for the single intake endpoint (app/api/intake/route.ts).
// Discriminated by sourceType; every variant carries the raw content for
// its format. Image/screenshot/pdf carry base64 -- this endpoint never
// accepts a bare URL for those (no fetch-on-our-behalf of an arbitrary
// attacker-supplied URL, same posture as isSafeFeedUrl for calendar
// feeds).
export const intakeRequestSchema = z.discriminatedUnion("sourceType", [
  z.object({ sourceType: z.literal("text"), text: z.string().trim().min(1).max(20000) }),
  z.object({ sourceType: z.literal("voice"), text: z.string().trim().min(1).max(20000) }),
  z.object({ sourceType: z.literal("ics"), icsText: z.string().trim().min(1).max(2_000_000) }),
  z.object({
    sourceType: z.literal("email"),
    subject: z.string().trim().max(500).nullable().optional(),
    bodyText: z.string().trim().min(1).max(50000),
  }),
  z.object({
    sourceType: z.enum(["image", "screenshot", "pdf"]),
    base64Data: z.string().min(1),
    mediaType: z.enum(["image/png", "image/jpeg", "image/webp", "application/pdf"]),
  }),
]);
export type IntakeRequest = z.infer<typeof intakeRequestSchema>;

export const actionLogInsertSchema = z.object({
  household_id: uuid,
  actor: z.enum(["ai", "system"]).optional(),
  feature: z.string().trim().min(1).max(100),
  action_summary: z.string().trim().min(1).max(500),
  read_summary: z.record(z.string(), z.unknown()).optional(),
  decision_summary: z.string().trim().max(2000).nullable().optional(),
  table_name: z.string().trim().min(1).max(100),
  record_id: uuid.nullable().optional(),
  before_snapshot: z.record(z.string(), z.unknown()).nullable().optional(),
  after_snapshot: z.record(z.string(), z.unknown()).nullable().optional(),
  undoable: z.boolean().optional(),
});

// Module 4 (scheduling_v2, D-120) — preference memory + calendar sync accounts.
// Reuses the existing `timeOfDay` schema declared above (care/work-schedule
// time-of-day fields) rather than redeclaring an equivalent regex.

export const briefFramingSchema = z.enum(["concise", "balanced", "detailed", "encouraging"]);

export const preferredActivityWindowSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: timeOfDay,
  endTime: timeOfDay,
});

export const householdSchedulingPreferencesUpdateSchema = z.object({
  quiet_hours_start: timeOfDay.nullable().optional(),
  quiet_hours_end: timeOfDay.nullable().optional(),
  response_priority_person_ids: z.array(uuid).optional(),
  brief_framing: briefFramingSchema.optional(),
  preferred_activity_windows: z.array(preferredActivityWindowSchema).optional(),
  schedule_review_cadence_days: z.number().int().positive().nullable().optional(),
});

export const calendarSyncProviderSchema = z.enum(["apple_icloud", "outlook_caldav", "google"]);
export const calendarSyncDirectionSchema = z.enum(["pull_only", "two_way"]);

// What a person actually fills in on the "connect a calendar" form. The
// app_password never gets stored as-is — the route encrypts it
// (lib/security/encryption.ts) before the repo insert, so this schema
// validates the plaintext exactly once, at the API boundary.
export const calendarSyncAccountConnectSchema = z.object({
  household_id: uuid,
  created_by_person_id: uuid,
  provider: calendarSyncProviderSchema,
  label: z.string().trim().min(1, "Give this connection a name.").max(80),
  caldav_server_url: z
    .string()
    .trim()
    .url("Enter a valid CalDAV server URL.")
    .refine((v) => v.startsWith("https://"), { message: "The CalDAV server URL must use https://." })
    .optional(),
  caldav_username: z.string().trim().min(1).max(200).optional(),
  caldav_app_password: z.string().trim().min(1).max(500).optional(),
  caldav_calendar_href: z.string().trim().max(2000).optional(),
  sync_direction: calendarSyncDirectionSchema.optional(),
});
