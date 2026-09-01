import { describe, it, expect } from "vitest";
import { verifyRecordPersisted, buildVerifiedConfirmationMessage } from "./verified-completion";

interface FakeRow {
  id: string;
  title: string;
  personId: string | null;
}

function fakeGetById(row: FakeRow | null) {
  return async (_client: unknown, _id: string) => row;
}

describe("verifyRecordPersisted", () => {
  it("verifies true and reports no mismatches when the persisted row matches every expected field", async () => {
    const row: FakeRow = { id: "r1", title: "Dentist", personId: "p1" };
    const result = await verifyRecordPersisted<FakeRow>({} as never, fakeGetById(row) as never, "r1", {
      title: "Dentist",
      personId: "p1",
    });
    expect(result.verified).toBe(true);
    expect(result.mismatches).toEqual([]);
    expect(result.record).toBe(row);
  });

  it("reports each field whose persisted value differs from expectation, and is not verified", async () => {
    const row: FakeRow = { id: "r1", title: "Dentist (wrong)", personId: "p1" };
    const result = await verifyRecordPersisted<FakeRow>({} as never, fakeGetById(row) as never, "r1", {
      title: "Dentist",
      personId: "p1",
    });
    expect(result.verified).toBe(false);
    expect(result.mismatches).toEqual(["title"]);
  });

  it("skips fields the caller passed as undefined -- no opinion, no mismatch", async () => {
    const row: FakeRow = { id: "r1", title: "Dentist", personId: null };
    const result = await verifyRecordPersisted<FakeRow>({} as never, fakeGetById(row) as never, "r1", {
      title: "Dentist",
      personId: undefined,
    });
    expect(result.verified).toBe(true);
  });

  it("reports record_not_found and a null record when the row can't be re-read at all", async () => {
    const result = await verifyRecordPersisted<FakeRow>({} as never, fakeGetById(null) as never, "missing", { title: "x" });
    expect(result.verified).toBe(false);
    expect(result.mismatches).toEqual(["record_not_found"]);
    expect(result.record).toBeNull();
  });
});

describe("buildVerifiedConfirmationMessage", () => {
  it("renders the described record when verification succeeded", () => {
    const row: FakeRow = { id: "r1", title: "Dentist", personId: "p1" };
    const message = buildVerifiedConfirmationMessage({ verified: true, mismatches: [], record: row }, (r) => `booked '${r.title}'`);
    expect(message).toBe("Saved — booked 'Dentist'.");
  });

  it("returns a hedged message instead of describeRecord when verification failed", () => {
    const message = buildVerifiedConfirmationMessage<FakeRow>({ verified: false, mismatches: ["record_not_found"], record: null }, (r) =>
      `booked '${r.title}'`
    );
    expect(message).toContain("couldn't verify");
  });
});
