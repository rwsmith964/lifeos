import { describe, expect, it } from "vitest";
import { planAccountDeletion, type MembershipInput } from "./account-deletion";

function membership(overrides: Partial<MembershipInput> = {}): MembershipInput {
  return {
    householdId: "household-1",
    householdName: "Smith Household",
    role: "owner",
    memberCount: 1,
    ...overrides,
  };
}

describe("planAccountDeletion", () => {
  it("deletes a single solo household outright", () => {
    const plan = planAccountDeletion([membership()]);
    expect(plan).toEqual({ status: "ready", steps: [{ kind: "delete_household", householdId: "household-1" }] });
  });

  it("blocks deletion when the caller owns a household with other members", () => {
    const plan = planAccountDeletion([membership({ memberCount: 3 })]);
    expect(plan).toEqual({ status: "blocked", householdName: "Smith Household", otherMemberCount: 2 });
  });

  it("lets a non-owner member of a shared household just leave it, not delete it", () => {
    const plan = planAccountDeletion([membership({ role: "adult", memberCount: 2 })]);
    expect(plan).toEqual({ status: "ready", steps: [{ kind: "leave_household", householdId: "household-1" }] });
  });

  it("handles a user belonging to more than one household: deletes the solo one, leaves the shared one", () => {
    const plan = planAccountDeletion([
      membership({ householdId: "solo", memberCount: 1 }),
      membership({ householdId: "shared", role: "adult", memberCount: 2 }),
    ]);
    expect(plan).toEqual({
      status: "ready",
      steps: [
        { kind: "delete_household", householdId: "solo" },
        { kind: "leave_household", householdId: "shared" },
      ],
    });
  });

  it("blocks the whole operation if ANY household is owner-with-others, even if others are fine", () => {
    const plan = planAccountDeletion([
      membership({ householdId: "solo", memberCount: 1 }),
      membership({ householdId: "co-parented", householdName: "Co-parented household", memberCount: 2 }),
    ]);
    expect(plan.status).toBe("blocked");
    if (plan.status === "blocked") {
      expect(plan.householdName).toBe("Co-parented household");
    }
  });

  it("a child role with other members never triggers the owner-blocked path", () => {
    const plan = planAccountDeletion([membership({ role: "child", memberCount: 4 })]);
    expect(plan).toEqual({ status: "ready", steps: [{ kind: "leave_household", householdId: "household-1" }] });
  });
});
