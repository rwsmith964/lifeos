import { describe, expect, it } from "vitest";
import { isOverdue, sortDoneTodos, sortOpenTodos } from "./order";

const t = (id: string, due: string | null, created: string, completed: string | null = null) => ({
  id,
  due_date: due,
  created_at: created,
  completed_at: completed,
});

describe("sortOpenTodos", () => {
  it("puts the soonest due date first and undated items last", () => {
    const out = sortOpenTodos([t("none", null, "2026-11-01"), t("late", "2026-12-01", "2026-11-02"), t("soon", "2026-11-10", "2026-11-03")]);
    expect(out.map((x) => x.id)).toEqual(["soon", "late", "none"]);
  });
  it("falls back to oldest first", () => {
    const out = sortOpenTodos([t("b", null, "2026-11-02"), t("a", null, "2026-11-01")]);
    expect(out.map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("sortDoneTodos", () => {
  it("shows the most recently finished first", () => {
    const out = sortDoneTodos([t("old", null, "x", "2026-11-01T10:00:00Z"), t("new", null, "x", "2026-11-05T10:00:00Z")]);
    expect(out.map((x) => x.id)).toEqual(["new", "old"]);
  });
});

describe("isOverdue", () => {
  it("is overdue only when open and past due", () => {
    expect(isOverdue({ due_date: "2026-11-01", completed_at: null }, "2026-11-08")).toBe(true);
    expect(isOverdue({ due_date: "2026-11-08", completed_at: null }, "2026-11-08")).toBe(false);
    expect(isOverdue({ due_date: "2026-11-01", completed_at: "2026-11-02T00:00:00Z" }, "2026-11-08")).toBe(false);
    expect(isOverdue({ due_date: null, completed_at: null }, "2026-11-08")).toBe(false);
  });
});
