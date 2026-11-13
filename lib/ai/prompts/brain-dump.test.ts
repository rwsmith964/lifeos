import { describe, expect, it } from "vitest";
import { BRAIN_DUMP_SYSTEM_PROMPT, buildBrainDumpUserPrompt } from "./brain-dump";

describe("buildBrainDumpUserPrompt", () => {
  it("lists how each person is labelled and where they live, so 'Mom's' can resolve to an address", () => {
    const prompt = buildBrainDumpUserPrompt(
      "Friday, November 13, 2026",
      [
        { id: "p1", label: "Jackie Smith", relationshipType: "parent", address: " 12 Oak Lane, Springfield " },
        { id: "p2", label: "Brittney Sink", relationshipType: "partner", relationshipLabel: "Girlfriend" },
        { id: "p3", label: "CHILD_1", relationshipType: "child", address: null },
      ],
      "Callan goes to Mom's"
    );
    expect(prompt).toContain("p1 — Jackie Smith — parent — lives at: 12 Oak Lane, Springfield");
    expect(prompt).toContain("p2 — Brittney Sink — partner (Girlfriend)");
    expect(prompt).not.toContain("p2 — Brittney Sink — partner (Girlfriend) — lives at");
    expect(prompt).toContain("p3 — CHILD_1 — child\n");
  });

  it("tells the model to treat a stay across days as one event and to fill in a location", () => {
    expect(BRAIN_DUMP_SYSTEM_PROMPT).toMatch(/ONE create_calendar_event/);
    expect(BRAIN_DUMP_SYSTEM_PROMPT).toMatch(/eventLocation/);
    expect(BRAIN_DUMP_SYSTEM_PROMPT).toMatch(/"Mom"/);
  });
});
