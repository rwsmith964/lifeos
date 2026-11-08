import { describe, expect, it } from "vitest";
import { logContact, undoLogContact } from "./log-contact";
import type { ContactCadenceRow } from "../db/database.types";

const PID = "457c0c27-54cb-46ce-b6e3-f485794ee9e0";

interface FakeState {
  person: { id: string; household_id: string } | null;
  cadence: Partial<ContactCadenceRow> | null;
  interactions: { id: string; person_id: string }[];
  failInsert?: boolean;
}

/** Table-aware fake covering exactly the query chains logContact/undoLogContact build. */
function fakeClient(state: FakeState) {
  const inserted: Record<string, unknown>[] = [];
  const cadenceUpdates: Record<string, unknown>[] = [];
  const removedInteractionIds: string[] = [];

  const client = {
    from: (table: string) => {
      if (table === "people") {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: state.person, error: null }) }) }) };
      }
      if (table === "contact_cadences") {
        return {
          select: () => ({
            eq: () => ({ limit: () => Promise.resolve({ data: state.cadence ? [state.cadence] : [], error: null }) }),
          }),
          update: (values: Record<string, unknown>) => {
            cadenceUpdates.push(values);
            return { eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: { ...state.cadence, ...values }, error: null }) }) }) };
          },
        };
      }
      if (table === "interactions") {
        return {
          insert: (values: Record<string, unknown>) => {
            inserted.push(values);
            return {
              select: () => ({
                single: () =>
                  state.failInsert
                    ? Promise.resolve({ data: null, error: { message: "boom", code: "XX000" } })
                    : Promise.resolve({ data: { id: "int-1", ...values }, error: null }),
              }),
            };
          },
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: state.interactions[0] ?? null, error: null }),
            }),
          }),
          delete: () => ({
            eq: (_col: string, id: string) => {
              removedInteractionIds.push(id);
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { client, inserted, cadenceUpdates, removedInteractionIds };
}

const baseParams = { householdId: "h1", personId: PID, type: "text" as const, todayLocal: "2026-10-18" };

describe("logContact", () => {
  it("logs a text contact dated today and advances the cadence", async () => {
    const { client, inserted, cadenceUpdates } = fakeClient({
      person: { id: PID, household_id: "h1" },
      cadence: { id: "c1", person_id: PID, target_interval_days: 5, last_contact_date: "2026-09-02", last_contact_type: "in_person" },
      interactions: [],
    });
    const result = await logContact(client as never, baseParams);
    expect(result.error).toBeNull();
    expect(inserted).toEqual([{ person_id: PID, interaction_type: "text", occurred_on: "2026-10-18" }]);
    expect(cadenceUpdates).toEqual([{ last_contact_date: "2026-10-18", last_contact_type: "text" }]);
    expect(result.interactionId).toBe("int-1");
    expect(result.previousLastContactDate).toBe("2026-09-02");
    expect(result.previousLastContactType).toBe("in_person");
  });

  it("still logs the interaction when the person has no cadence row", async () => {
    const { client, inserted, cadenceUpdates } = fakeClient({ person: { id: PID, household_id: "h1" }, cadence: null, interactions: [] });
    const result = await logContact(client as never, baseParams);
    expect(result.error).toBeNull();
    expect(inserted).toHaveLength(1);
    expect(cadenceUpdates).toHaveLength(0);
    expect(result.previousLastContactDate).toBeNull();
  });

  it("honours a backdated contact", async () => {
    const { client, inserted } = fakeClient({ person: { id: PID, household_id: "h1" }, cadence: null, interactions: [] });
    await logContact(client as never, { ...baseParams, occurredOn: "2026-10-16" });
    expect(inserted[0]).toMatchObject({ occurred_on: "2026-10-16" });
  });

  it("rejects a future date and a malformed date without writing anything", async () => {
    const { client, inserted } = fakeClient({ person: { id: PID, household_id: "h1" }, cadence: null, interactions: [] });
    expect((await logContact(client as never, { ...baseParams, occurredOn: "2026-10-19" })).error).toMatch(/future/i);
    expect((await logContact(client as never, { ...baseParams, occurredOn: "yesterday" })).error).toMatch(/valid/i);
    expect(inserted).toHaveLength(0);
  });

  it("refuses a person from a different household", async () => {
    const { client, inserted } = fakeClient({ person: { id: PID, household_id: "someone-elses" }, cadence: null, interactions: [] });
    const result = await logContact(client as never, baseParams);
    expect(result.error).toMatch(/couldn't find/i);
    expect(inserted).toHaveLength(0);
  });

  it("returns an error (not a throw) when the write fails", async () => {
    const { client } = fakeClient({ person: { id: PID, household_id: "h1" }, cadence: null, interactions: [], failInsert: true });
    const result = await logContact(client as never, baseParams);
    expect(result.error).toBeTruthy();
  });
});

describe("undoLogContact", () => {
  it("removes the interaction and restores the cadence's previous last contact", async () => {
    const { client, cadenceUpdates, removedInteractionIds } = fakeClient({
      person: { id: PID, household_id: "h1" },
      cadence: { id: "c1", person_id: PID, last_contact_date: "2026-10-18", last_contact_type: "text" },
      interactions: [{ id: "int-1", person_id: PID }],
    });
    const result = await undoLogContact(client as never, {
      householdId: "h1",
      personId: PID,
      interactionId: "int-1",
      previousLastContactDate: "2026-09-02",
      previousLastContactType: "in_person",
    });
    expect(result.error).toBeNull();
    expect(removedInteractionIds).toEqual(["int-1"]);
    expect(cadenceUpdates).toEqual([{ last_contact_date: "2026-09-02", last_contact_type: "in_person" }]);
  });

  it("won't remove an interaction that belongs to a different person", async () => {
    const { client, removedInteractionIds } = fakeClient({
      person: null,
      cadence: null,
      interactions: [{ id: "int-1", person_id: "other-person" }],
    });
    const result = await undoLogContact(client as never, {
      householdId: "h1",
      personId: PID,
      interactionId: "int-1",
      previousLastContactDate: null,
      previousLastContactType: null,
    });
    expect(result.error).toBeTruthy();
    expect(removedInteractionIds).toHaveLength(0);
  });
});
