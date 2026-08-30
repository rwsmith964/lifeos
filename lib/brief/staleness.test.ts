import { describe, expect, it } from "vitest";
import { isBriefStale } from "./staleness";

const GENERATED_AT = "2026-08-30T09:00:00.000Z";

describe("isBriefStale", () => {
  it("is not stale when every row predates generation", () => {
    const rows = [
      { created_at: "2026-08-29T10:00:00.000Z", updated_at: "2026-08-29T10:00:00.000Z" },
      { created_at: "2026-08-30T08:00:00.000Z", updated_at: "2026-08-30T08:59:59.000Z" },
    ];
    expect(isBriefStale(GENERATED_AT, rows)).toBe(false);
  });

  it("is stale when a row was updated after generation", () => {
    const rows = [
      { created_at: "2026-08-29T10:00:00.000Z", updated_at: "2026-08-30T09:05:00.000Z" },
    ];
    expect(isBriefStale(GENERATED_AT, rows)).toBe(true);
  });

  it("is stale when a row was created after generation (the reported bug: a new weekend event)", () => {
    const rows = [
      { created_at: "2026-08-30T09:10:00.000Z", updated_at: "2026-08-30T09:10:00.000Z" },
    ];
    expect(isBriefStale(GENERATED_AT, rows)).toBe(true);
  });

  it("is not stale with no rows at all", () => {
    expect(isBriefStale(GENERATED_AT, [])).toBe(false);
  });

  it("treats an exact-timestamp match as not stale (boundary)", () => {
    const rows = [{ created_at: GENERATED_AT, updated_at: GENERATED_AT }];
    expect(isBriefStale(GENERATED_AT, rows)).toBe(false);
  });
});
