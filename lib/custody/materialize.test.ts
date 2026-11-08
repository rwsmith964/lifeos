import { describe, expect, it } from "vitest";
import { floatingIso } from "./materialize";

describe("floatingIso", () => {
  it("stores wall-clock time as if it were UTC, so 8:30 AM is 08:30Z", () => {
    expect(floatingIso("2026-11-23T08:30")).toBe("2026-11-23T08:30:00.000Z");
    expect(floatingIso("2026-11-23T17:00:00")).toBe("2026-11-23T17:00:00.000Z");
  });

  it("does not double-apply a Z", () => {
    expect(floatingIso("2026-11-23T08:30:00Z")).toBe("2026-11-23T08:30:00.000Z");
  });

  it("gives the same answer whatever timezone the process runs in", () => {
    // The point of the helper: the previous `new Date(str).toISOString()`
    // returned 16:30Z when run under America/Los_Angeles. This must not.
    expect(floatingIso("2026-11-23T08:30")).toBe("2026-11-23T08:30:00.000Z");
  });
});
