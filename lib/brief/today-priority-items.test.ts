import { describe, expect, it } from "vitest";
import { buildTodayPriorityItems } from "./today-priority-items";
import type { BriefContent } from "./schema";
import type { PersonRow } from "../db/database.types";

function emptyContent(overrides: Partial<BriefContent> = {}): BriefContent {
  return {
    headline: "Test headline",
    today: [],
    headsUp: [],
    people: [],
    suggestion: null,
    weather: null,
    ...overrides,
  };
}

function person(overrides: Partial<PersonRow> = {}): PersonRow {
  return {
    id: "person-1",
    household_id: "household-1",
    user_id: null,
    full_name: "Jackie Smith",
    nickname: null,
    relationship_type: "friend",
    phone: "555-1234",
    email: null,
    notes: null,
    is_archived: false,
    is_childcare_provider: false,
    birthdate: null,
    birth_year_known: true,
    gender: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as PersonRow;
}

describe("buildTodayPriorityItems", () => {
  describe("reach-out items (B3/B4)", () => {
    it("uses a stable person-id-based key, not an array index", () => {
      const p = person();
      const content = emptyContent({ people: [{ personLabel: "Jackie Smith", reason: "9 days since last contact — past your usual cadence." }] });
      const items = buildTodayPriorityItems({
        content,
        householdPeopleByName: new Map([["Jackie Smith", p]]),
        opportunities: [],
        household: [],
      });
      expect(items[0]!.id).toBe(`reach-out:${p.id}`);
      expect(items[0]!.personId).toBe(p.id);
    });

    it("shortens the eyebrow metadata to a day count instead of repeating the full sentence (B3)", () => {
      const content = emptyContent({ people: [{ personLabel: "Jackie Smith", reason: "9 days since last contact — past your usual cadence." }] });
      const items = buildTodayPriorityItems({
        content,
        householdPeopleByName: new Map([["Jackie Smith", person()]]),
        opportunities: [],
        household: [],
      });
      expect(items[0]!.metadata).toBe("9 days");
    });

    it("headline is just the person's name -- the full reason moves to detail, not duplicated (B3)", () => {
      const content = emptyContent({ people: [{ personLabel: "Jackie Smith", reason: "9 days since last contact — past your usual cadence." }] });
      const items = buildTodayPriorityItems({
        content,
        householdPeopleByName: new Map([["Jackie Smith", person()]]),
        opportunities: [],
        household: [],
      });
      expect(items[0]!.headline).toBe("Jackie Smith");
      expect(items[0]!.detail).toBe("9 days since last contact — past your usual cadence.");
    });

    it("uses People as the one source/badge label (B4)", () => {
      const content = emptyContent({ people: [{ personLabel: "Jackie Smith", reason: "9 days since last contact." }] });
      const items = buildTodayPriorityItems({
        content,
        householdPeopleByName: new Map([["Jackie Smith", person()]]),
        opportunities: [],
        household: [],
      });
      expect(items[0]!.source).toBe("People");
    });

    it("falls back to a generic day-count label when the reason has no leading number", () => {
      const content = emptyContent({ people: [{ personLabel: "Jackie Smith", reason: "Overdue for a call." }] });
      const items = buildTodayPriorityItems({
        content,
        householdPeopleByName: new Map([["Jackie Smith", person()]]),
        opportunities: [],
        household: [],
      });
      expect(items[0]!.metadata).toBe("Overdue");
    });

    it("without a resolvable person record, falls back to an unresolved key and no phone action", () => {
      const content = emptyContent({ people: [{ personLabel: "Ghost Person", reason: "5 days since last contact." }] });
      const items = buildTodayPriorityItems({
        content,
        householdPeopleByName: new Map(),
        opportunities: [],
        household: [],
      });
      expect(items[0]!.id).toBe("reach-out:unresolved-0");
      expect(items[0]!.personId).toBeUndefined();
      expect(items[0]!.primaryAction).toEqual({ label: "Find in People", href: "/people" });
    });
  });

  describe("decide items", () => {
    it("strips the 'opportunities:' id prefix down to the raw opportunity id", () => {
      const items = buildTodayPriorityItems({
        content: emptyContent(),
        householdPeopleByName: new Map(),
        opportunities: [{ id: "opportunities:abc-123", headline: "Magpie Cafe", reasoning: "Scored 57" }],
        household: [],
      });
      expect(items[0]!.id).toBe("decide:abc-123");
      expect(items[0]!.opportunityId).toBe("abc-123");
    });

    it("handles an unprefixed opportunity id too (the legacy path)", () => {
      const items = buildTodayPriorityItems({
        content: emptyContent(),
        householdPeopleByName: new Map(),
        opportunities: [{ id: "abc-123", headline: "Magpie Cafe", reasoning: "Scored 57" }],
        household: [],
      });
      expect(items[0]!.opportunityId).toBe("abc-123");
    });

    it("the content.suggestion fallback only appears when there are zero real opportunities, and has no opportunityId", () => {
      const content = emptyContent({ suggestion: { title: "Reach out to Jackie and Fritz", detail: "Both overdue." } });
      const withNoOpportunities = buildTodayPriorityItems({
        content,
        householdPeopleByName: new Map(),
        opportunities: [],
        household: [],
      });
      expect(withNoOpportunities.some((i) => i.id === "decide:suggestion")).toBe(true);
      expect(withNoOpportunities.find((i) => i.id === "decide:suggestion")!.opportunityId).toBeUndefined();

      const withOpportunities = buildTodayPriorityItems({
        content,
        householdPeopleByName: new Map(),
        opportunities: [{ id: "x", headline: "H", reasoning: "R" }],
        household: [],
      });
      expect(withOpportunities.some((i) => i.id === "decide:suggestion")).toBe(false);
    });
  });

  describe("quick items", () => {
    it("categorizes a gift-shaped heads-up under Gifts with a stable hash-based id", () => {
      const content = emptyContent({ headsUp: [{ title: "Order by Friday", detail: "Callan's birthday gift ships slow." }] });
      const items = buildTodayPriorityItems({ content, householdPeopleByName: new Map(), opportunities: [], household: [] });
      expect(items[0]!.source).toBe("Gifts");
      expect(items[0]!.id).toMatch(/^quick-headsup:/);
    });

    it("the same heads-up text always produces the same id (stable across brief regenerations)", () => {
      const content = emptyContent({ headsUp: [{ title: "Order by Friday", detail: "Ships slow." }] });
      const a = buildTodayPriorityItems({ content, householdPeopleByName: new Map(), opportunities: [], household: [] });
      const b = buildTodayPriorityItems({ content, householdPeopleByName: new Map(), opportunities: [], household: [] });
      expect(a[0]!.id).toBe(b[0]!.id);
    });

    it("flags the dinner-gap household item with its own kind so it gets the inline meal picker", () => {
      const items = buildTodayPriorityItems({
        content: emptyContent(),
        householdPeopleByName: new Map(),
        opportunities: [],
        household: [{ id: "household:dinner-gap", title: "Nothing planned for dinner tonight" }],
      });
      expect(items[0]!.kind).toBe("quick_household_dinner");
    });

    it("other household items stay a plain quick_household card", () => {
      const items = buildTodayPriorityItems({
        content: emptyContent(),
        householdPeopleByName: new Map(),
        opportunities: [],
        household: [{ id: "household:chore:1", title: "Take out trash — overdue" }],
      });
      expect(items[0]!.kind).toBe("quick_household");
    });
  });

  describe("dismissal filtering (B2)", () => {
    it("filters out an item whose stable id is in dismissedItemIds", () => {
      const p = person();
      const content = emptyContent({ people: [{ personLabel: "Jackie Smith", reason: "9 days since last contact." }] });
      const items = buildTodayPriorityItems({
        content,
        householdPeopleByName: new Map([["Jackie Smith", p]]),
        opportunities: [],
        household: [],
        dismissedItemIds: new Set([`reach-out:${p.id}`]),
      });
      expect(items).toHaveLength(0);
    });

    it("leaves other items alone", () => {
      const p = person();
      const content = emptyContent({ people: [{ personLabel: "Jackie Smith", reason: "9 days since last contact." }] });
      const items = buildTodayPriorityItems({
        content,
        householdPeopleByName: new Map([["Jackie Smith", p]]),
        opportunities: [],
        household: [],
        dismissedItemIds: new Set(["reach-out:some-other-person"]),
      });
      expect(items).toHaveLength(1);
    });
  });

  describe("ranking", () => {
    it("sorts reach-out before decide before quick items regardless of input order", () => {
      const items = buildTodayPriorityItems({
        content: emptyContent({
          headsUp: [{ title: "Quick item", detail: "detail" }],
          people: [{ personLabel: "Jackie Smith", reason: "9 days." }],
        }),
        householdPeopleByName: new Map([["Jackie Smith", person()]]),
        opportunities: [{ id: "x", headline: "Decide item", reasoning: "r" }],
        household: [],
      });
      expect(items.map((i) => i.kind)).toEqual(["reach_out", "decide", "quick_headsup"]);
    });
  });
});
