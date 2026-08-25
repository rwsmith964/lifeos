import { describe, expect, it, vi } from "vitest";
import { friendlyMutationError, PG_CHECK_VIOLATION, PG_UNIQUE_VIOLATION } from "./errors";

describe("friendlyMutationError", () => {
  it("maps a unique-violation error to the caller's message (D-032 regression: duplicate interest used to crash the app)", () => {
    const error = { code: PG_UNIQUE_VIOLATION, message: 'duplicate key value violates unique constraint "person_interests_person_interest_unique"' };
    const message = friendlyMutationError(error, { uniqueViolation: "Carol already has gardening listed." });
    expect(message).toBe("Carol already has gardening listed.");
  });

  it("maps a check-violation error to the caller's message", () => {
    const error = { code: PG_CHECK_VIOLATION, message: "new row for relation violates check constraint" };
    const message = friendlyMutationError(error, { checkViolation: "Max must be at least the minimum." });
    expect(message).toBe("Max must be at least the minimum.");
  });

  it("falls back to the generic default when no specific message is registered for the code", () => {
    const error = { code: PG_UNIQUE_VIOLATION, message: "duplicate key" };
    expect(friendlyMutationError(error)).toBe("Something went wrong saving that — please try again.");
  });

  it("uses the caller's fallback for an unrecognized error shape (never leaks the raw message)", () => {
    const error = new Error("connection terminated unexpectedly");
    const message = friendlyMutationError(error, { fallback: "Couldn't save this person — please try again." });
    expect(message).toBe("Couldn't save this person — please try again.");
    expect(message).not.toContain("connection terminated");
  });

  it("never returns a raw Postgres message even when no messages object is passed", () => {
    const error = { code: "42501", message: "new row violates row-level security policy" };
    const message = friendlyMutationError(error);
    expect(message).not.toContain("row-level security");
  });

  it("logs the real error server-side regardless of which message is shown", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    friendlyMutationError({ code: PG_UNIQUE_VIOLATION, message: "duplicate key" });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
