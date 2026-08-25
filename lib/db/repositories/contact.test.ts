import { describe, expect, it } from "vitest";
import { recordContactForCadence } from "./contact";
import type { ContactCadenceRow } from "../database.types";

/**
 * Minimal fake mirroring the exact chain shapes createRepository's list()
 * and update() build against a real Supabase client — enough to drive
 * recordContactForCadence through its real getCadenceForPerson +
 * contactCadencesRepo.update calls without a live database.
 */
function fakeClient(existingCadence: ContactCadenceRow | null) {
  const updates: Record<string, unknown>[] = [];
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({
          limit: () => Promise.resolve({ data: existingCadence ? [existingCadence] : [], error: null }),
        }),
      }),
      update: (values: Record<string, unknown>) => {
        updates.push(values);
        return {
          eq: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({ data: { ...existingCadence, ...values }, error: null }),
            }),
          }),
        };
      },
    }),
  };
  return { client, updates };
}

const baseCadence: ContactCadenceRow = {
  id: "cad-1",
  person_id: "person-1",
  target_interval_days: 30,
  last_contact_date: null,
  last_contact_type: null,
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("recordContactForCadence", () => {
  it("does nothing when the person has no cadence row", async () => {
    const { client, updates } = fakeClient(null);
    await recordContactForCadence(client as never, "person-1", "2026-08-24", "in_person");
    expect(updates).toHaveLength(0);
  });

  it("sets last_contact_date/type when the cadence has no prior contact (D-032 regression: cadence contradicting the contact log)", async () => {
    const { client, updates } = fakeClient({ ...baseCadence, last_contact_date: null });
    await recordContactForCadence(client as never, "person-1", "2026-08-24", "in_person");
    expect(updates).toEqual([{ last_contact_date: "2026-08-24", last_contact_type: "in_person" }]);
  });

  it("advances last_contact_date when the new contact is more recent", async () => {
    const { client, updates } = fakeClient({ ...baseCadence, last_contact_date: "2026-07-01", last_contact_type: "call" });
    await recordContactForCadence(client as never, "person-1", "2026-08-24", "in_person");
    expect(updates).toEqual([{ last_contact_date: "2026-08-24", last_contact_type: "in_person" }]);
  });

  it("does not regress last_contact_date for an older or same-day contact", async () => {
    const { client, updates } = fakeClient({ ...baseCadence, last_contact_date: "2026-08-24", last_contact_type: "in_person" });
    await recordContactForCadence(client as never, "person-1", "2026-08-01", "call");
    expect(updates).toHaveLength(0);
  });
});
