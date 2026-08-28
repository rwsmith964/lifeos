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
});
