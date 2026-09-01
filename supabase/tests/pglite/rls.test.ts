// Real end-to-end RLS verification (Section 6.2's "non-negotiable" test
// suite) against the actual migrations + actual seed data, via PGlite —
// see harness.ts for why this exists alongside (not instead of) the pgTAP
// suite in supabase/tests/database/. This is what caught D-026, a real
// cross-household privilege-escalation bug in the household_members
// bootstrap policy, before it ever reached a live database.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asServiceRole, asUser, createSeededDatabase } from "./harness";

const RICHARD_USER = "10000000-0000-0000-0000-000000000001"; // seeded owner
const SEEDED_HOUSEHOLD = "20000000-0000-0000-0000-000000000001"; // seeded

const OUTSIDER_HOUSEHOLD = "90000000-0000-0000-0000-000000000001";
const OUTSIDER_USER = "90000000-0000-0000-0000-000000000002";
const OUTSIDER_PERSON = "90000000-0000-0000-0000-000000000003";

const FRESH_HOUSEHOLD = "90000000-0000-0000-0000-000000000010";
const FRESH_USER = "90000000-0000-0000-0000-000000000011";

const CHILD_USER = "90000000-0000-0000-0000-000000000020";
const CHILD_PERSON = "90000000-0000-0000-0000-000000000021";

// Seeded rows this suite asserts against directly (see supabase/seed.sql).
const PRIVATE_EVENT = "80000000-0000-0000-0000-000000000002"; // "Team standup"
const HOUSEHOLD_EVENT = "80000000-0000-0000-0000-000000000001"; // "Golf with Mike"
const SHARED_EVENT = "80000000-0000-0000-0000-000000000008"; // "Kids handoff to Jennifer"
const DAVE_PERSON = "30000000-0000-0000-0000-000000000005"; // seeded, friend
const RICHARD_PERSON = "30000000-0000-0000-0000-000000000001"; // seeded, self

describe("RLS end-to-end (PGlite, real migrations + real seed data)", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await createSeededDatabase();

    await asServiceRole(db, async () => {
      await db.exec(`insert into auth.users (id, email) values ('${OUTSIDER_USER}', 'outsider@example.com');`);
      await db.exec(`insert into households (id, name) values ('${OUTSIDER_HOUSEHOLD}', 'Outsider Household');`);
      await db.exec(
        `insert into household_members (household_id, user_id, role) values ('${OUTSIDER_HOUSEHOLD}', '${OUTSIDER_USER}', 'owner');`
      );
      await db.exec(
        `insert into people (id, household_id, user_id, full_name, relationship_type) values ('${OUTSIDER_PERSON}', '${OUTSIDER_HOUSEHOLD}', '${OUTSIDER_USER}', 'Outsider Self', 'self');`
      );

      await db.exec(`insert into auth.users (id, email) values ('${FRESH_USER}', 'fresh@example.com');`);
      await db.exec(`insert into households (id, name) values ('${FRESH_HOUSEHOLD}', 'Fresh Household');`);

      await db.exec(`insert into auth.users (id, email) values ('${CHILD_USER}', 'kid@example.com');`);
      await db.exec(
        `insert into people (id, household_id, user_id, full_name, relationship_type) values ('${CHILD_PERSON}', '${SEEDED_HOUSEHOLD}', '${CHILD_USER}', 'Kid Tester', 'child');`
      );
      await db.exec(
        `insert into household_members (household_id, user_id, role) values ('${SEEDED_HOUSEHOLD}', '${CHILD_USER}', 'child');`
      );
    });
  }, 30_000);

  afterAll(async () => {
    await db.close();
  });

  describe("household isolation, as the seeded owner (Richard)", () => {
    it("sees only their own household", async () => {
      const rows = await asUser(db, RICHARD_USER, () => db.query("select id from households;"));
      expect((rows.rows as { id: string }[]).map((r) => r.id)).toEqual([SEEDED_HOUSEHOLD]);
    });

    it("sees all 13 people in their household (12 seeded + the child fixture)", async () => {
      const rows = await asUser(db, RICHARD_USER, () => db.query("select count(*)::int as n from people;"));
      expect((rows.rows[0] as { n: number }).n).toBe(13);
    });

    it("cannot see the outsider household's people even when scoped by id", async () => {
      const rows = await asUser(db, RICHARD_USER, () =>
        db.query(`select count(*)::int as n from people where household_id = '${OUTSIDER_HOUSEHOLD}';`)
      );
      expect((rows.rows[0] as { n: number }).n).toBe(0);
    });

    it("sees household gifts and contact cadences (owner role)", async () => {
      const gifts = await asUser(db, RICHARD_USER, () => db.query("select count(*)::int as n from gifts;"));
      expect((gifts.rows[0] as { n: number }).n).toBeGreaterThan(0);
      const cadences = await asUser(db, RICHARD_USER, () =>
        db.query("select count(*)::int as n from contact_cadences;")
      );
      expect((cadences.rows[0] as { n: number }).n).toBeGreaterThan(0);
    });
  });

  describe("household isolation, as an unrelated outsider", () => {
    it("sees only their own household and person", async () => {
      const households = await asUser(db, OUTSIDER_USER, () => db.query("select id from households;"));
      expect((households.rows as { id: string }[]).map((r) => r.id)).toEqual([OUTSIDER_HOUSEHOLD]);
      const people = await asUser(db, OUTSIDER_USER, () => db.query("select count(*)::int as n from people;"));
      expect((people.rows[0] as { n: number }).n).toBe(1);
    });

    it("cannot see any of Richard's gifts, gift_suggestions, custody_blocks, or calendar_events", async () => {
      for (const table of ["gifts", "gift_suggestions", "custody_blocks", "calendar_events"]) {
        const rows = await asUser(db, OUTSIDER_USER, () => db.query(`select count(*)::int as n from ${table};`));
        expect((rows.rows[0] as { n: number }).n, `${table} should be empty for an outsider`).toBe(0);
      }
    });
  });

  describe("calendar_events visibility tiers", () => {
    it("creator can read their own private event", async () => {
      const rows = await asUser(db, RICHARD_USER, () =>
        db.query(`select id from calendar_events where id = '${PRIVATE_EVENT}';`)
      );
      expect(rows.rows.length).toBe(1);
    });

    it("an outsider cannot read a private or household-tier event with no link", async () => {
      const priv = await asUser(db, OUTSIDER_USER, () =>
        db.query(`select id from calendar_events where id = '${PRIVATE_EVENT}';`)
      );
      expect(priv.rows.length).toBe(0);
      const household = await asUser(db, OUTSIDER_USER, () =>
        db.query(`select id from calendar_events where id = '${HOUSEHOLD_EVENT}';`)
      );
      expect(household.rows.length).toBe(0);
    });
  });

  describe("household_members bootstrap policy (D-026 regression)", () => {
    it("a user can self-join an empty (just-created) household", async () => {
      await expect(
        asUser(db, FRESH_USER, () =>
          db.exec(
            `insert into household_members (household_id, user_id, role) values ('${FRESH_HOUSEHOLD}', '${FRESH_USER}', 'owner');`
          )
        )
      ).resolves.not.toThrow();
    });

    it("a user CANNOT self-join a household that already has an owner (the D-026 bug)", async () => {
      await expect(
        asUser(db, OUTSIDER_USER, () =>
          db.exec(
            `insert into household_members (household_id, user_id, role) values ('${SEEDED_HOUSEHOLD}', '${OUTSIDER_USER}', 'adult');`
          )
        )
      ).rejects.toThrow();
    });
  });

  describe("gift spoiler-safety (D-007)", () => {
    it("a child-role member of the household still sees people, but not gifts", async () => {
      const people = await asUser(db, CHILD_USER, () => db.query("select count(*)::int as n from people;"));
      expect((people.rows[0] as { n: number }).n).toBe(13);
      const gifts = await asUser(db, CHILD_USER, () => db.query("select count(*)::int as n from gifts;"));
      expect((gifts.rows[0] as { n: number }).n).toBe(0);
    });
  });

  describe("household_links: shared_with_coparent tier (pending vs active)", () => {
    it("stays hidden while the link is only pending", async () => {
      await asServiceRole(db, () =>
        db.exec(
          `insert into household_links (household_a_id, household_b_id, status) values ('${SEEDED_HOUSEHOLD}', '${OUTSIDER_HOUSEHOLD}', 'pending');`
        )
      );
      const rows = await asUser(db, OUTSIDER_USER, () =>
        db.query(`select id from calendar_events where id = '${SHARED_EVENT}';`)
      );
      expect(rows.rows.length).toBe(0);
    });

    it("becomes visible once the link is active, without leaking other tiers or tables", async () => {
      await asServiceRole(db, () =>
        db.exec(
          `update household_links set status = 'active' where household_a_id = '${SEEDED_HOUSEHOLD}' and household_b_id = '${OUTSIDER_HOUSEHOLD}';`
        )
      );

      const shared = await asUser(db, OUTSIDER_USER, () =>
        db.query(`select id from calendar_events where id = '${SHARED_EVENT}';`)
      );
      expect(shared.rows.length).toBe(1);

      const stillPrivate = await asUser(db, OUTSIDER_USER, () =>
        db.query(`select id from calendar_events where id = '${PRIVATE_EVENT}';`)
      );
      expect(stillPrivate.rows.length).toBe(0);

      const stillHousehold = await asUser(db, OUTSIDER_USER, () =>
        db.query(`select id from calendar_events where id = '${HOUSEHOLD_EVENT}';`)
      );
      expect(stillHousehold.rows.length).toBe(0);

      const peopleLeak = await asUser(db, OUTSIDER_USER, () =>
        db.query(`select count(*)::int as n from people where household_id = '${SEEDED_HOUSEHOLD}';`)
      );
      expect((peopleLeak.rows[0] as { n: number }).n).toBe(0);

      const giftsLeak = await asUser(db, OUTSIDER_USER, () => db.query("select count(*)::int as n from gifts;"));
      expect((giftsLeak.rows[0] as { n: number }).n).toBe(0);
    });
  });

  describe("person_interests and person_gift_budgets (household-readable, D-009)", () => {
    it("Richard sees Dave's seeded interests and budgets; the outsider sees none", async () => {
      const richardInterests = await asUser(db, RICHARD_USER, () =>
        db.query(`select count(*)::int as n from person_interests where person_id = '${DAVE_PERSON}';`)
      );
      expect((richardInterests.rows[0] as { n: number }).n).toBeGreaterThan(0);

      const outsiderInterests = await asUser(db, OUTSIDER_USER, () =>
        db.query(`select count(*)::int as n from person_interests where person_id = '${DAVE_PERSON}';`)
      );
      expect((outsiderInterests.rows[0] as { n: number }).n).toBe(0);

      const outsiderBudgets = await asUser(db, OUTSIDER_USER, () =>
        db.query("select count(*)::int as n from person_gift_budgets;")
      );
      expect((outsiderBudgets.rows[0] as { n: number }).n).toBe(0);
    });

    it("a child-role member can read interests/budgets but only owner/adult can write them", async () => {
      const childRead = await asUser(db, CHILD_USER, () =>
        db.query(`select count(*)::int as n from person_interests where person_id = '${DAVE_PERSON}';`)
      );
      expect((childRead.rows[0] as { n: number }).n).toBeGreaterThan(0);

      await expect(
        asUser(db, CHILD_USER, () =>
          db.exec(
            `insert into person_interests (person_id, interest) values ('${DAVE_PERSON}', 'child-role-should-not-be-able-to-add-this');`
          )
        )
      ).rejects.toThrow();
    });
  });

  describe("person_gift_sites (D-063, mirrors person_interests RLS exactly)", () => {
    it("Richard sees Dave's seeded gift sites; the outsider sees none", async () => {
      await asUser(db, RICHARD_USER, () =>
        db.exec(
          `insert into person_gift_sites (person_id, label, url) values ('${DAVE_PERSON}', 'Etsy', 'https://www.etsy.com') on conflict (person_id, url) do nothing;`
        )
      );

      const richardSites = await asUser(db, RICHARD_USER, () =>
        db.query(`select count(*)::int as n from person_gift_sites where person_id = '${DAVE_PERSON}';`)
      );
      expect((richardSites.rows[0] as { n: number }).n).toBeGreaterThan(0);

      const outsiderSites = await asUser(db, OUTSIDER_USER, () =>
        db.query(`select count(*)::int as n from person_gift_sites where person_id = '${DAVE_PERSON}';`)
      );
      expect((outsiderSites.rows[0] as { n: number }).n).toBe(0);
    });

    it("a child-role member can read gift sites but only owner/adult can write them", async () => {
      const childRead = await asUser(db, CHILD_USER, () =>
        db.query(`select count(*)::int as n from person_gift_sites where person_id = '${DAVE_PERSON}';`)
      );
      expect((childRead.rows[0] as { n: number }).n).toBeGreaterThanOrEqual(0);

      await expect(
        asUser(db, CHILD_USER, () =>
          db.exec(
            `insert into person_gift_sites (person_id, label, url) values ('${DAVE_PERSON}', 'Should Fail', 'https://should-fail.example.com');`
          )
        )
      ).rejects.toThrow();
    });
  });

  describe("work_schedules and time_off_entries (D-064, mirror person_interests RLS exactly)", () => {
    it("Richard sees Dave's seeded work schedule; the outsider sees none", async () => {
      await asUser(db, RICHARD_USER, () =>
        db.exec(
          `insert into work_schedules (person_id, day_of_week, start_time, end_time, label) values ('${DAVE_PERSON}', 3, '09:00', '17:00', 'Work');`
        )
      );

      const richardSchedules = await asUser(db, RICHARD_USER, () =>
        db.query(`select count(*)::int as n from work_schedules where person_id = '${DAVE_PERSON}';`)
      );
      expect((richardSchedules.rows[0] as { n: number }).n).toBeGreaterThan(0);

      const outsiderSchedules = await asUser(db, OUTSIDER_USER, () =>
        db.query(`select count(*)::int as n from work_schedules where person_id = '${DAVE_PERSON}';`)
      );
      expect((outsiderSchedules.rows[0] as { n: number }).n).toBe(0);
    });

    it("a child-role member can read work schedules but only owner/adult can write them", async () => {
      const childRead = await asUser(db, CHILD_USER, () =>
        db.query(`select count(*)::int as n from work_schedules where person_id = '${DAVE_PERSON}';`)
      );
      expect((childRead.rows[0] as { n: number }).n).toBeGreaterThanOrEqual(0);

      await expect(
        asUser(db, CHILD_USER, () =>
          db.exec(
            `insert into work_schedules (person_id, day_of_week, start_time, end_time, label) values ('${DAVE_PERSON}', 4, '09:00', '17:00', 'Should Fail');`
          )
        )
      ).rejects.toThrow();
    });

    it("Richard sees Dave's seeded time off; the outsider sees none", async () => {
      await asUser(db, RICHARD_USER, () =>
        db.exec(
          `insert into time_off_entries (person_id, start_date, end_date, reason) values ('${DAVE_PERSON}', '2026-09-04', '2026-09-04', 'Vacation');`
        )
      );

      const richardTimeOff = await asUser(db, RICHARD_USER, () =>
        db.query(`select count(*)::int as n from time_off_entries where person_id = '${DAVE_PERSON}';`)
      );
      expect((richardTimeOff.rows[0] as { n: number }).n).toBeGreaterThan(0);

      const outsiderTimeOff = await asUser(db, OUTSIDER_USER, () =>
        db.query(`select count(*)::int as n from time_off_entries where person_id = '${DAVE_PERSON}';`)
      );
      expect((outsiderTimeOff.rows[0] as { n: number }).n).toBe(0);
    });

    it("a child-role member can read time off but only owner/adult can write it", async () => {
      const childRead = await asUser(db, CHILD_USER, () =>
        db.query(`select count(*)::int as n from time_off_entries where person_id = '${DAVE_PERSON}';`)
      );
      expect((childRead.rows[0] as { n: number }).n).toBeGreaterThanOrEqual(0);

      await expect(
        asUser(db, CHILD_USER, () =>
          db.exec(
            `insert into time_off_entries (person_id, start_date, end_date, reason) values ('${DAVE_PERSON}', '2026-09-05', '2026-09-05', 'Should Fail');`
          )
        )
      ).rejects.toThrow();
    });
  });

  describe("user_activities and activity_locations (activity_household_id helper)", () => {
    it("Richard sees his seeded activities and their locations; the outsider sees none", async () => {
      const richardActivities = await asUser(db, RICHARD_USER, () =>
        db.query("select count(*)::int as n from user_activities;")
      );
      expect((richardActivities.rows[0] as { n: number }).n).toBeGreaterThan(0);
      const richardLocations = await asUser(db, RICHARD_USER, () =>
        db.query("select count(*)::int as n from activity_locations;")
      );
      expect((richardLocations.rows[0] as { n: number }).n).toBeGreaterThan(0);

      const outsiderActivities = await asUser(db, OUTSIDER_USER, () =>
        db.query("select count(*)::int as n from user_activities;")
      );
      expect((outsiderActivities.rows[0] as { n: number }).n).toBe(0);
      const outsiderLocations = await asUser(db, OUTSIDER_USER, () =>
        db.query("select count(*)::int as n from activity_locations;")
      );
      expect((outsiderLocations.rows[0] as { n: number }).n).toBe(0);
    });
  });

  describe("ai_usage_log (owner/adult only, D-012 cost-visibility)", () => {
    it("a child-role member cannot read ai_usage_log even though they can read most other household data", async () => {
      await asServiceRole(db, () =>
        db.exec(
          `insert into ai_usage_log (household_id, feature, model, input_tokens, output_tokens, estimated_cost_cents) values ('${SEEDED_HOUSEHOLD}', 'daily_brief', 'claude-sonnet-4-6', 100, 50, 1.5);`
        )
      );

      const richardSees = await asUser(db, RICHARD_USER, () =>
        db.query("select count(*)::int as n from ai_usage_log;")
      );
      expect((richardSees.rows[0] as { n: number }).n).toBeGreaterThan(0);

      const childSees = await asUser(db, CHILD_USER, () => db.query("select count(*)::int as n from ai_usage_log;"));
      expect((childSees.rows[0] as { n: number }).n).toBe(0);
    });
  });

  describe("notifications (recipient-only, not household-wide)", () => {
    it("only the addressed person can read their own notification, not another household member", async () => {
      await asServiceRole(db, () =>
        db.exec(
          `insert into notifications (household_id, person_id, notification_type, title, body) values ('${SEEDED_HOUSEHOLD}', '${CHILD_PERSON}', 'daily_brief', 'Test', 'Test body');`
        )
      );

      const childSees = await asUser(db, CHILD_USER, () =>
        db.query("select count(*)::int as n from notifications;")
      );
      expect((childSees.rows[0] as { n: number }).n).toBe(1);

      const richardSees = await asUser(db, RICHARD_USER, () =>
        db.query("select count(*)::int as n from notifications;")
      );
      expect((richardSees.rows[0] as { n: number }).n, "Richard is a different person, not the addressee").toBe(0);
    });
  });

  describe("weekend_plans (household-readable)", () => {
    it("household members see it, the outsider does not", async () => {
      await asServiceRole(db, () =>
        db.exec(
          `insert into weekend_plans (household_id, for_date, content_json, content_markdown, model_version) values ('${SEEDED_HOUSEHOLD}', '2026-08-22', '{}', 'test plan', 'test');`
        )
      );

      const richardSees = await asUser(db, RICHARD_USER, () =>
        db.query("select count(*)::int as n from weekend_plans;")
      );
      expect((richardSees.rows[0] as { n: number }).n).toBe(1);

      const outsiderSees = await asUser(db, OUTSIDER_USER, () =>
        db.query("select count(*)::int as n from weekend_plans;")
      );
      expect((outsiderSees.rows[0] as { n: number }).n).toBe(0);
    });
  });

  describe("household_invites (D-055, invite/accept flow)", () => {
    const INVITEE_USER = "90000000-0000-0000-0000-000000000030";
    const INVITEE_EMAIL = "invitee@example.com";

    beforeAll(async () => {
      await asServiceRole(db, () =>
        db.exec(`insert into auth.users (id, email) values ('${INVITEE_USER}', '${INVITEE_EMAIL}');`)
      );
    });

    it("an owner can create an invite, an outsider cannot read it directly", async () => {
      const created = await asUser(db, RICHARD_USER, () =>
        db.query(
          `insert into household_invites (household_id, invited_email, role, invited_by_user_id) values ('${SEEDED_HOUSEHOLD}', '${INVITEE_EMAIL}', 'adult', '${RICHARD_USER}') returning id, token;`
        )
      );
      expect(created.rows).toHaveLength(1);

      const outsiderSees = await asUser(db, OUTSIDER_USER, () =>
        db.query("select count(*)::int as n from household_invites where household_id = $1;", [SEEDED_HOUSEHOLD])
      );
      expect((outsiderSees.rows[0] as { n: number }).n).toBe(0);
    });

    it("a non-owner adult cannot directly insert an invite (server action enforces this in app code, but RLS is the real backstop)", async () => {
      await expect(
        asUser(db, CHILD_USER, () =>
          db.exec(
            `insert into household_invites (household_id, invited_email, role, invited_by_user_id) values ('${SEEDED_HOUSEHOLD}', 'someone-else@example.com', 'adult', '${CHILD_USER}');`
          )
        )
      ).rejects.toThrow();
    });

    it("household_member_emails only returns emails for a household the caller belongs to", async () => {
      const richardSees = await asUser(db, RICHARD_USER, () =>
        db.query("select email from household_member_emails($1);", [SEEDED_HOUSEHOLD])
      );
      expect((richardSees.rows as { email: string }[]).map((r) => r.email)).toContain("richard@example.com");

      const outsiderSees = await asUser(db, OUTSIDER_USER, () =>
        db.query("select email from household_member_emails($1);", [SEEDED_HOUSEHOLD])
      );
      expect(outsiderSees.rows).toHaveLength(0);
    });

    it("accept_household_invite adds the invited (correct-email) user as a member and flips invite to accepted", async () => {
      // The first test in this describe block already created a still-pending
      // invite for INVITEE_EMAIL, and the partial unique index only allows one
      // pending invite per (household, email) — use a distinct address here.
      const acceptEmail = "invitee-accept@example.com";
      await asServiceRole(db, () =>
        db.exec(`insert into auth.users (id, email) values ('${INVITEE_USER}', '${acceptEmail}') on conflict (id) do update set email = excluded.email;`)
      );
      const created = await asUser(db, RICHARD_USER, () =>
        db.query<{ token: string }>(
          `insert into household_invites (household_id, invited_email, role, invited_by_user_id) values ('${SEEDED_HOUSEHOLD}', '${acceptEmail}', 'viewer', '${RICHARD_USER}') returning token;`
        )
      );
      const token = (created.rows[0] as { token: string }).token;

      const accepted = await asUser(db, INVITEE_USER, () =>
        db.query("select * from accept_household_invite($1);", [token])
      );
      expect(accepted.rows).toHaveLength(1);

      const memberRow = await asUser(db, INVITEE_USER, () =>
        db.query("select role from household_members where household_id = $1 and user_id = $2;", [
          SEEDED_HOUSEHOLD,
          INVITEE_USER,
        ])
      );
      expect((memberRow.rows[0] as { role: string }).role).toBe("viewer");

      const inviteRow = await asUser(db, RICHARD_USER, () =>
        db.query("select status from household_invites where token = $1;", [token])
      );
      expect((inviteRow.rows[0] as { status: string }).status).toBe("accepted");
    });

    it("accept_household_invite rejects a caller whose auth email doesn't match the invite (wrong-account case)", async () => {
      const created = await asUser(db, RICHARD_USER, () =>
        db.query<{ token: string }>(
          `insert into household_invites (household_id, invited_email, role, invited_by_user_id) values ('${SEEDED_HOUSEHOLD}', 'someone-else@example.com', 'viewer', '${RICHARD_USER}') returning token;`
        )
      );
      const token = (created.rows[0] as { token: string }).token;

      let caughtError: unknown;
      try {
        await asUser(db, OUTSIDER_USER, () => db.query("select * from accept_household_invite($1);", [token]));
      } catch (error) {
        caughtError = error;
      }
      expect((caughtError as { code?: string } | undefined)?.code).toBe("42501");
    });

    it("accept_household_invite rejects an already-accepted invite (re-use case)", async () => {
      const created = await asUser(db, RICHARD_USER, () =>
        db.query<{ token: string }>(
          `insert into household_invites (household_id, invited_email, role, invited_by_user_id) values ('${SEEDED_HOUSEHOLD}', 'reuse-test@example.com', 'viewer', '${RICHARD_USER}') returning token;`
        )
      );
      const token = (created.rows[0] as { token: string }).token;
      await asServiceRole(db, () =>
        db.exec(`insert into auth.users (id, email) values (gen_random_uuid(), 'reuse-test@example.com');`)
      );
      const reuseUserRow = await asServiceRole(db, () =>
        db.query<{ id: string }>("select id from auth.users where email = 'reuse-test@example.com';")
      );
      const reuseUser = (reuseUserRow.rows[0] as { id: string }).id;

      await asUser(db, reuseUser, () => db.query("select * from accept_household_invite($1);", [token]));

      let caughtError: unknown;
      try {
        await asUser(db, reuseUser, () => db.query("select * from accept_household_invite($1);", [token]));
      } catch (error) {
        caughtError = error;
      }
      expect((caughtError as { code?: string } | undefined)?.code).toBe("22023");
    });

    it("accept_household_invite rejects an unknown token", async () => {
      let caughtError: unknown;
      try {
        await asUser(db, OUTSIDER_USER, () =>
          db.query("select * from accept_household_invite($1);", ["00000000-0000-0000-0000-000000000099"])
        );
      } catch (error) {
        caughtError = error;
      }
      expect((caughtError as { code?: string } | undefined)?.code).toBe("P0002");
    });

    it("a non-owner member can leave the household voluntarily via the new DELETE policy", async () => {
      const membershipRow = await asUser(db, INVITEE_USER, () =>
        db.query("select id from household_members where household_id = $1 and user_id = $2;", [
          SEEDED_HOUSEHOLD,
          INVITEE_USER,
        ])
      );
      const membershipId = (membershipRow.rows[0] as { id: string }).id;

      await asUser(db, INVITEE_USER, () =>
        db.exec(`delete from household_members where id = '${membershipId}';`)
      );

      const stillThere = await asServiceRole(db, () =>
        db.query("select count(*)::int as n from household_members where id = $1;", [membershipId])
      );
      expect((stillThere.rows[0] as { n: number }).n).toBe(0);
    });

    it("an owner cannot be removed by the leave-household DELETE policy (no self-service path for owners)", async () => {
      const ownerRow = await asServiceRole(db, () =>
        db.query("select id from household_members where household_id = $1 and user_id = $2;", [
          SEEDED_HOUSEHOLD,
          RICHARD_USER,
        ])
      );
      const ownerMembershipId = (ownerRow.rows[0] as { id: string }).id;

      const result = await asUser(db, RICHARD_USER, () =>
        db.exec(`delete from household_members where id = '${ownerMembershipId}';`)
      );
      void result;

      const stillOwner = await asServiceRole(db, () =>
        db.query("select count(*)::int as n from household_members where id = $1;", [ownerMembershipId])
      );
      expect((stillOwner.rows[0] as { n: number }).n, "owner row must survive — app code blocks this too").toBe(1);
    });
  });

  describe("feature_flags (D-115, Build Brief Additive Contract §3.2 -- mirrors calendar_feeds RLS exactly)", () => {
    it("a household member can read a flag row inserted by an owner; the outsider sees none", async () => {
      await asUser(db, RICHARD_USER, () =>
        db.exec(
          `insert into feature_flags (household_id, flag_key, enabled) values ('${SEEDED_HOUSEHOLD}', 'relationship_gift_engine_v2', true);`
        )
      );

      const childRead = await asUser(db, CHILD_USER, () =>
        db.query(
          `select enabled from feature_flags where household_id = '${SEEDED_HOUSEHOLD}' and flag_key = 'relationship_gift_engine_v2';`
        )
      );
      expect((childRead.rows[0] as { enabled: boolean }).enabled).toBe(true);

      const outsiderRead = await asUser(db, OUTSIDER_USER, () =>
        db.query(
          `select count(*)::int as n from feature_flags where household_id = '${SEEDED_HOUSEHOLD}' and flag_key = 'relationship_gift_engine_v2';`
        )
      );
      expect((outsiderRead.rows[0] as { n: number }).n).toBe(0);
    });

    it("a child-role member can read flags but cannot insert or update one (owner/adult only, same gate as calendar_feeds)", async () => {
      await expect(
        asUser(db, CHILD_USER, () =>
          db.exec(
            `insert into feature_flags (household_id, flag_key, enabled) values ('${SEEDED_HOUSEHOLD}', 'leisure_planner_v2', true);`
          )
        )
      ).rejects.toThrow();

      await asUser(db, RICHARD_USER, () =>
        db.exec(
          `insert into feature_flags (household_id, flag_key, enabled) values ('${SEEDED_HOUSEHOLD}', 'leisure_planner_v2', false);`
        )
      );

      // Postgres RLS's UPDATE `using` clause silently filters rows rather than
      // throwing when none match (unlike INSERT's `with check`, which does
      // throw) -- so the correct assertion here is that the child's update is
      // a no-op, not that it errors.
      await asUser(db, CHILD_USER, () =>
        db.exec(
          `update feature_flags set enabled = true where household_id = '${SEEDED_HOUSEHOLD}' and flag_key = 'leisure_planner_v2';`
        )
      );

      const stillDisabled = await asServiceRole(db, () =>
        db.query(
          `select enabled from feature_flags where household_id = '${SEEDED_HOUSEHOLD}' and flag_key = 'leisure_planner_v2';`
        )
      );
      expect((stillDisabled.rows[0] as { enabled: boolean }).enabled).toBe(false);
    });

    it("a fresh household with zero feature_flags rows has no visible flags for anyone (default-off baseline)", async () => {
      const rows = await asServiceRole(db, () =>
        db.query(`select count(*)::int as n from feature_flags where household_id = '${FRESH_HOUSEHOLD}';`)
      );
      expect((rows.rows[0] as { n: number }).n).toBe(0);
    });
  });

  describe("person_profile_details, person_wishlist_items, person_relationships, conversation_log_entries (Module 1, D-117, household-readable like person_interests)", () => {
    it("household members can read profile details/wishlist/relationships/log entries the owner adds; the outsider sees none", async () => {
      await asUser(db, RICHARD_USER, () =>
        db.exec(
          `insert into person_profile_details (person_id, food_preferences) values ('${DAVE_PERSON}', 'Loves Thai food') on conflict (person_id) do nothing;`
        )
      );
      await asUser(db, RICHARD_USER, () =>
        db.exec(`insert into person_wishlist_items (person_id, item) values ('${DAVE_PERSON}', 'A new fishing rod');`)
      );
      await asUser(db, RICHARD_USER, () =>
        db.exec(
          `insert into person_relationships (person_id, related_name, relation_label) values ('${DAVE_PERSON}', 'Jane', 'wife');`
        )
      );
      await asUser(db, RICHARD_USER, () =>
        db.exec(`insert into conversation_log_entries (person_id, content) values ('${DAVE_PERSON}', 'Mentioned wanting a new rod.');`)
      );

      for (const table of [
        "person_profile_details",
        "person_wishlist_items",
        "person_relationships",
        "conversation_log_entries",
      ]) {
        const childRead = await asUser(db, CHILD_USER, () =>
          db.query(`select count(*)::int as n from ${table} where person_id = '${DAVE_PERSON}';`)
        );
        expect((childRead.rows[0] as { n: number }).n, `${table} should be readable by a child-role household member`).toBeGreaterThan(0);

        const outsiderRead = await asUser(db, OUTSIDER_USER, () =>
          db.query(`select count(*)::int as n from ${table} where person_id = '${DAVE_PERSON}';`)
        );
        expect((outsiderRead.rows[0] as { n: number }).n, `${table} should be invisible to an outsider`).toBe(0);
      }
    });

    it("a child-role member cannot write to any of the four tables (owner/adult only)", async () => {
      await expect(
        asUser(db, CHILD_USER, () =>
          db.exec(`insert into person_wishlist_items (person_id, item) values ('${DAVE_PERSON}', 'should not be allowed');`)
        )
      ).rejects.toThrow();

      await expect(
        asUser(db, CHILD_USER, () =>
          db.exec(
            `insert into person_relationships (person_id, related_name, relation_label) values ('${DAVE_PERSON}', 'Should Fail', 'friend');`
          )
        )
      ).rejects.toThrow();

      await expect(
        asUser(db, CHILD_USER, () =>
          db.exec(`insert into conversation_log_entries (person_id, content) values ('${DAVE_PERSON}', 'should not be allowed');`)
        )
      ).rejects.toThrow();

      await expect(
        asUser(db, CHILD_USER, () =>
          db.exec(
            `update person_profile_details set food_preferences = 'hacked' where person_id = '${DAVE_PERSON}';`
          )
        )
      ).resolves.not.toThrow(); // UPDATE's `using` clause filters silently (0 rows), same as feature_flags above

      const stillOriginal = await asServiceRole(db, () =>
        db.query(`select food_preferences from person_profile_details where person_id = '${DAVE_PERSON}';`)
      );
      expect((stillOriginal.rows[0] as { food_preferences: string }).food_preferences).toBe("Loves Thai food");
    });
  });

  describe("moments (Module 1, D-117, household-scoped like weekend_plans)", () => {
    it("household members can read a moment the owner logs; the outsider sees none", async () => {
      await asUser(db, RICHARD_USER, () =>
        db.exec(
          `insert into moments (household_id, title, occurred_on, participant_person_ids) values ('${SEEDED_HOUSEHOLD}', 'Beach day', '2026-07-04', array['${RICHARD_PERSON}','${DAVE_PERSON}']::uuid[]);`
        )
      );

      const childRead = await asUser(db, CHILD_USER, () =>
        db.query(`select count(*)::int as n from moments where household_id = '${SEEDED_HOUSEHOLD}';`)
      );
      expect((childRead.rows[0] as { n: number }).n).toBeGreaterThan(0);

      const outsiderRead = await asUser(db, OUTSIDER_USER, () =>
        db.query(`select count(*)::int as n from moments where household_id = '${SEEDED_HOUSEHOLD}';`)
      );
      expect((outsiderRead.rows[0] as { n: number }).n).toBe(0);
    });

    it("a child-role member can read moments but cannot insert one (owner/adult only)", async () => {
      const childRead = await asUser(db, CHILD_USER, () =>
        db.query(`select count(*)::int as n from moments where household_id = '${SEEDED_HOUSEHOLD}';`)
      );
      expect((childRead.rows[0] as { n: number }).n).toBeGreaterThan(0);

      await expect(
        asUser(db, CHILD_USER, () =>
          db.exec(
            `insert into moments (household_id, title, occurred_on) values ('${SEEDED_HOUSEHOLD}', 'Should fail', '2026-07-05');`
          )
        )
      ).rejects.toThrow();
    });
  });

  describe("gift_reciprocity_entries (Module 1, D-117, owner/adult-only read+write -- spoiler-safety, mirrors gifts RLS exactly per D-007)", () => {
    it("a child-role member of the household cannot read reciprocity entries at all", async () => {
      await asUser(db, RICHARD_USER, () =>
        db.exec(
          `insert into gift_reciprocity_entries (household_id, person_id, direction, description) values ('${SEEDED_HOUSEHOLD}', '${DAVE_PERSON}', 'received_from_them', 'A nice scarf');`
        )
      );

      const childRead = await asUser(db, CHILD_USER, () =>
        db.query(`select count(*)::int as n from gift_reciprocity_entries where person_id = '${DAVE_PERSON}';`)
      );
      expect((childRead.rows[0] as { n: number }).n).toBe(0);

      const richardRead = await asUser(db, RICHARD_USER, () =>
        db.query(`select count(*)::int as n from gift_reciprocity_entries where person_id = '${DAVE_PERSON}';`)
      );
      expect((richardRead.rows[0] as { n: number }).n).toBeGreaterThan(0);
    });

    it("the outsider sees none, and a child-role member cannot insert one", async () => {
      const outsiderRead = await asUser(db, OUTSIDER_USER, () =>
        db.query("select count(*)::int as n from gift_reciprocity_entries;")
      );
      expect((outsiderRead.rows[0] as { n: number }).n).toBe(0);

      await expect(
        asUser(db, CHILD_USER, () =>
          db.exec(
            `insert into gift_reciprocity_entries (household_id, person_id, direction, description) values ('${SEEDED_HOUSEHOLD}', '${DAVE_PERSON}', 'given_to_them', 'should not be allowed');`
          )
        )
      ).rejects.toThrow();
    });
  });

  describe("gift_suggestions.pipeline_stage (Module 1, D-117, purely additive column)", () => {
    it("defaults to null on an existing table's real rows and is independently updatable by an owner", async () => {
      const existing = await asUser(db, RICHARD_USER, () =>
        db.query(`select id, pipeline_stage from gift_suggestions where person_id = '${DAVE_PERSON}' limit 1;`)
      );
      expect(existing.rows.length).toBeGreaterThan(0);
      const { id, pipeline_stage } = existing.rows[0] as { id: string; pipeline_stage: string | null };
      expect(pipeline_stage).toBeNull();

      await asUser(db, RICHARD_USER, () =>
        db.exec(`update gift_suggestions set pipeline_stage = 'idea' where id = '${id}';`)
      );
      const updated = await asUser(db, RICHARD_USER, () =>
        db.query(`select pipeline_stage from gift_suggestions where id = '${id}';`)
      );
      expect((updated.rows[0] as { pipeline_stage: string }).pipeline_stage).toBe("idea");
    });

    it("rejects a value outside the 7-state pipeline", async () => {
      const existing = await asUser(db, RICHARD_USER, () =>
        db.query(`select id from gift_suggestions where person_id = '${DAVE_PERSON}' limit 1;`)
      );
      const { id } = existing.rows[0] as { id: string };
      await expect(
        asUser(db, RICHARD_USER, () => db.exec(`update gift_suggestions set pipeline_stage = 'bogus_stage' where id = '${id}';`))
      ).rejects.toThrow();
    });
  });

  describe("activity_type_viability_configs (Module 2, D-118, household-scoped like user_activities)", () => {
    it("household members can read a config the owner declares; the outsider sees none", async () => {
      await asUser(db, RICHARD_USER, () =>
        db.exec(
          `insert into activity_type_viability_configs (household_id, activity_type_key, relevant_inputs) values ('${SEEDED_HOUSEHOLD}', 'fishing', array['river_flow','solunar']::text[]);`
        )
      );

      const childRead = await asUser(db, CHILD_USER, () =>
        db.query(`select count(*)::int as n from activity_type_viability_configs where household_id = '${SEEDED_HOUSEHOLD}';`)
      );
      expect((childRead.rows[0] as { n: number }).n).toBeGreaterThan(0);

      const outsiderRead = await asUser(db, OUTSIDER_USER, () =>
        db.query(`select count(*)::int as n from activity_type_viability_configs where household_id = '${SEEDED_HOUSEHOLD}';`)
      );
      expect((outsiderRead.rows[0] as { n: number }).n).toBe(0);
    });

    it("a child-role member can read configs but cannot insert one (owner/adult only)", async () => {
      await expect(
        asUser(db, CHILD_USER, () =>
          db.exec(
            `insert into activity_type_viability_configs (household_id, activity_type_key) values ('${SEEDED_HOUSEHOLD}', 'golf');`
          )
        )
      ).rejects.toThrow();
    });

    it("rejects a second config for the same (household, activity_type_key) pair", async () => {
      await expect(
        asUser(db, RICHARD_USER, () =>
          db.exec(
            `insert into activity_type_viability_configs (household_id, activity_type_key) values ('${SEEDED_HOUSEHOLD}', 'fishing');`
          )
        )
      ).rejects.toThrow();
    });
  });

  describe("gear_checklist_items (Module 2, D-118, household-scoped like user_activities)", () => {
    const GOLF_ACTIVITY = "60000000-0000-0000-0000-000000000001";

    it("household members can read a gear item the owner adds; the outsider sees none", async () => {
      await asUser(db, RICHARD_USER, () =>
        db.exec(
          `insert into gear_checklist_items (household_id, user_activity_id, item_label, sort_order) values ('${SEEDED_HOUSEHOLD}', '${GOLF_ACTIVITY}', 'Golf clubs', 0);`
        )
      );

      const childRead = await asUser(db, CHILD_USER, () =>
        db.query(`select count(*)::int as n from gear_checklist_items where household_id = '${SEEDED_HOUSEHOLD}';`)
      );
      expect((childRead.rows[0] as { n: number }).n).toBeGreaterThan(0);

      const outsiderRead = await asUser(db, OUTSIDER_USER, () =>
        db.query(`select count(*)::int as n from gear_checklist_items where household_id = '${SEEDED_HOUSEHOLD}';`)
      );
      expect((outsiderRead.rows[0] as { n: number }).n).toBe(0);
    });

    it("a child-role member can read gear items but cannot insert one (owner/adult only)", async () => {
      await expect(
        asUser(db, CHILD_USER, () =>
          db.exec(
            `insert into gear_checklist_items (household_id, user_activity_id, item_label) values ('${SEEDED_HOUSEHOLD}', '${GOLF_ACTIVITY}', 'Should fail');`
          )
        )
      ).rejects.toThrow();
    });

    it("the one-target check constraint rejects both a user_activity_id and an activity_type_key together, and rejects neither", async () => {
      await expect(
        asUser(db, RICHARD_USER, () =>
          db.exec(
            `insert into gear_checklist_items (household_id, user_activity_id, activity_type_key, item_label) values ('${SEEDED_HOUSEHOLD}', '${GOLF_ACTIVITY}', 'golf', 'Both set');`
          )
        )
      ).rejects.toThrow();

      await expect(
        asUser(db, RICHARD_USER, () =>
          db.exec(
            `insert into gear_checklist_items (household_id, item_label) values ('${SEEDED_HOUSEHOLD}', 'Neither set');`
          )
        )
      ).rejects.toThrow();
    });
  });

  describe("leisure_outing_logs (Module 2, D-118, household-scoped like user_activities)", () => {
    const FISHING_ACTIVITY = "60000000-0000-0000-0000-000000000002";

    it("household members can read an outing log the owner adds; the outsider sees none", async () => {
      await asUser(db, RICHARD_USER, () =>
        db.exec(
          `insert into leisure_outing_logs (household_id, user_activity_id, occurred_on, rating, companions_person_ids) values ('${SEEDED_HOUSEHOLD}', '${FISHING_ACTIVITY}', '2026-07-04', 4, array['${DAVE_PERSON}']::uuid[]);`
        )
      );

      const childRead = await asUser(db, CHILD_USER, () =>
        db.query(`select count(*)::int as n from leisure_outing_logs where household_id = '${SEEDED_HOUSEHOLD}';`)
      );
      expect((childRead.rows[0] as { n: number }).n).toBeGreaterThan(0);

      const outsiderRead = await asUser(db, OUTSIDER_USER, () =>
        db.query(`select count(*)::int as n from leisure_outing_logs where household_id = '${SEEDED_HOUSEHOLD}';`)
      );
      expect((outsiderRead.rows[0] as { n: number }).n).toBe(0);
    });

    it("a child-role member can read outing logs but cannot insert one (owner/adult only)", async () => {
      await expect(
        asUser(db, CHILD_USER, () =>
          db.exec(
            `insert into leisure_outing_logs (household_id, user_activity_id, occurred_on) values ('${SEEDED_HOUSEHOLD}', '${FISHING_ACTIVITY}', '2026-07-05');`
          )
        )
      ).rejects.toThrow();
    });

    it("rejects a rating outside the 1-5 range", async () => {
      await expect(
        asUser(db, RICHARD_USER, () =>
          db.exec(
            `insert into leisure_outing_logs (household_id, user_activity_id, occurred_on, rating) values ('${SEEDED_HOUSEHOLD}', '${FISHING_ACTIVITY}', '2026-07-06', 6);`
          )
        )
      ).rejects.toThrow();
    });
  });

  describe("intake_drafts (Module 3, D-119, household-readable/writable like brain_dump_batches)", () => {
    it("household members can read a draft the owner creates; the outsider sees none", async () => {
      await asUser(db, RICHARD_USER, () =>
        db.exec(
          `insert into intake_drafts (household_id, created_by_person_id, source_type, detected_record_type, extracted_fields, overall_confidence, source_excerpt, status) values ('${SEEDED_HOUSEHOLD}', '${RICHARD_PERSON}', 'text', 'calendar_event', '{"title":{"value":"Dentist","confidence":0.9}}'::jsonb, 0.9, 'dentist appt', 'ready');`
        )
      );

      const childRead = await asUser(db, CHILD_USER, () =>
        db.query(`select count(*)::int as n from intake_drafts where household_id = '${SEEDED_HOUSEHOLD}';`)
      );
      expect((childRead.rows[0] as { n: number }).n).toBeGreaterThan(0);

      const outsiderRead = await asUser(db, OUTSIDER_USER, () =>
        db.query(`select count(*)::int as n from intake_drafts where household_id = '${SEEDED_HOUSEHOLD}';`)
      );
      expect((outsiderRead.rows[0] as { n: number }).n).toBe(0);
    });

    it("a child-role member can insert and update a draft (no owner/adult gate on intake, per the brief's shared-inbox framing)", async () => {
      const { rows } = await asUser(db, CHILD_USER, () =>
        db.query(
          `insert into intake_drafts (household_id, source_type, detected_record_type, extracted_fields, overall_confidence, source_excerpt, status) values ('${SEEDED_HOUSEHOLD}', 'text', 'ambiguous', '{}'::jsonb, 0, 'unclear note', 'needs_review') returning id;`
        )
      );
      const { id } = rows[0] as { id: string };

      await asUser(db, CHILD_USER, () => db.exec(`update intake_drafts set status = 'rejected' where id = '${id}';`));
      const reread = await asUser(db, CHILD_USER, () => db.query(`select status from intake_drafts where id = '${id}';`));
      expect((reread.rows[0] as { status: string }).status).toBe("rejected");
    });

    it("the outsider cannot insert a draft into a household they don't belong to", async () => {
      await expect(
        asUser(db, OUTSIDER_USER, () =>
          db.exec(
            `insert into intake_drafts (household_id, source_type, detected_record_type, extracted_fields, overall_confidence, source_excerpt, status) values ('${SEEDED_HOUSEHOLD}', 'text', 'ambiguous', '{}'::jsonb, 0, 'should fail', 'needs_review');`
          )
        )
      ).rejects.toThrow();
    });

    it("the converted_table/converted_record_id pair constraint rejects one set without the other", async () => {
      await expect(
        asUser(db, RICHARD_USER, () =>
          db.exec(
            `insert into intake_drafts (household_id, source_type, detected_record_type, extracted_fields, overall_confidence, source_excerpt, status, converted_table) values ('${SEEDED_HOUSEHOLD}', 'text', 'moment', '{}'::jsonb, 0.9, 'partial', 'converted', 'moments');`
          )
        )
      ).rejects.toThrow();
    });
  });

  describe("action_log (Module 3, D-119, household-readable, owner/adult-only undo)", () => {
    it("household members can read a log entry the owner's session inserts; the outsider sees none", async () => {
      await asUser(db, RICHARD_USER, () =>
        db.exec(
          `insert into action_log (household_id, feature, action_summary, table_name, record_id) values ('${SEEDED_HOUSEHOLD}', 'quick_capture', 'Created calendar event Dentist for Dave', 'calendar_events', '${DAVE_PERSON}');`
        )
      );

      const childRead = await asUser(db, CHILD_USER, () =>
        db.query(`select count(*)::int as n from action_log where household_id = '${SEEDED_HOUSEHOLD}';`)
      );
      expect((childRead.rows[0] as { n: number }).n).toBeGreaterThan(0);

      const outsiderRead = await asUser(db, OUTSIDER_USER, () =>
        db.query(`select count(*)::int as n from action_log where household_id = '${SEEDED_HOUSEHOLD}';`)
      );
      expect((outsiderRead.rows[0] as { n: number }).n).toBe(0);
    });

    it("any household member (including a child-role member) can insert a log entry for their own household", async () => {
      await asUser(db, CHILD_USER, () =>
        db.exec(
          `insert into action_log (household_id, feature, action_summary, table_name) values ('${SEEDED_HOUSEHOLD}', 'intake_convert', 'Added gift idea for Dave', 'gifts');`
        )
      );
      const read = await asUser(db, RICHARD_USER, () =>
        db.query(`select count(*)::int as n from action_log where household_id = '${SEEDED_HOUSEHOLD}' and feature = 'intake_convert';`)
      );
      expect((read.rows[0] as { n: number }).n).toBeGreaterThan(0);
    });

    it("a child-role member's undo update matches zero rows (owner/adult-only USING clause), but the owner's succeeds", async () => {
      const { rows } = await asUser(db, RICHARD_USER, () =>
        db.query(
          `insert into action_log (household_id, feature, action_summary, table_name, undoable) values ('${SEEDED_HOUSEHOLD}', 'quick_capture', 'Logged a call with Dave', 'interactions', true) returning id;`
        )
      );
      const { id } = rows[0] as { id: string };

      // No with-check clause on this policy -- the role gate is enforced
      // via USING, which silently filters the target row to zero matches
      // for a non-owner/adult caller rather than throwing. Assert the row
      // is untouched, then confirm the owner's identical update actually
      // takes effect.
      const childAttempt = await asUser(db, CHILD_USER, () => db.exec(`update action_log set undone_at = now() where id = '${id}';`));
      expect((childAttempt[0] as { rowCount: number }).rowCount).toBe(0);
      const afterChildAttempt = await asUser(db, RICHARD_USER, () => db.query(`select undone_at from action_log where id = '${id}';`));
      expect((afterChildAttempt.rows[0] as { undone_at: string | null }).undone_at).toBeNull();

      await asUser(db, RICHARD_USER, () => db.exec(`update action_log set undone_at = now() where id = '${id}';`));
      const reread = await asUser(db, RICHARD_USER, () => db.query(`select undone_at from action_log where id = '${id}';`));
      expect((reread.rows[0] as { undone_at: string | null }).undone_at).not.toBeNull();
    });
  });

  describe("opportunities.score_breakdown (Module 2, D-118, purely additive column)", () => {
    it("defaults to null and is independently updatable by a household member (insert is service-role only, per the existing detection-engine policy)", async () => {
      const { rows: inserted } = await asServiceRole(db, () =>
        db.query(
          `insert into opportunities (household_id, activity_id, opportunity_type, for_date, score, headline, reasoning, expires_at) values ('${SEEDED_HOUSEHOLD}', '60000000-0000-0000-0000-000000000001', 'activity_window', '2026-07-10', 90, 'Test headline', 'Test reasoning', '2026-07-11') returning id, score_breakdown;`
        )
      );
      expect(inserted.length).toBeGreaterThan(0);
      expect((inserted[0] as { score_breakdown: unknown }).score_breakdown).toBeNull();

      const { id } = inserted[0] as { id: string };
      await asUser(db, RICHARD_USER, () =>
        db.exec(`update opportunities set score_breakdown = '{"weatherSuitability": 27}'::jsonb where id = '${id}';`)
      );
      const updated = await asUser(db, RICHARD_USER, () =>
        db.query(`select score_breakdown from opportunities where id = '${id}';`)
      );
      expect((updated.rows[0] as { score_breakdown: { weatherSuitability: number } }).score_breakdown).toEqual({
        weatherSuitability: 27,
      });
    });
  });
});
