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
});
