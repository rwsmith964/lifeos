import { describe, expect, it } from "vitest";
import { groupSuggestionsByPersonAndRun } from "./group-suggestions";

function suggestion(
  id: string,
  personId: string,
  personName: string,
  occasionType: "birthday" | "just_because",
  occasionDate: string
) {
  return {
    id,
    person_id: personId,
    occasion_type: occasionType,
    occasion_date: occasionDate,
    person: { full_name: personName },
  };
}

describe("groupSuggestionsByPersonAndRun", () => {
  it("groups by person in order of first appearance", () => {
    const input = [
      suggestion("1", "cal", "Callan Smith", "birthday", "2026-08-27"),
      suggestion("2", "emma", "Emma Smith", "just_because", "2026-08-28"),
      suggestion("3", "cal", "Callan Smith", "birthday", "2026-08-27"),
    ];
    const groups = groupSuggestionsByPersonAndRun(input);
    expect(groups.map((g) => g.personId)).toEqual(["cal", "emma"]);
    expect(groups[0].personName).toBe("Callan Smith");
    expect(groups[0].runs[0].suggestions.map((s) => s.id)).toEqual(["1", "3"]);
  });

  it("sub-groups one person's suggestions into separate runs by occasion type + date", () => {
    const input = [
      suggestion("1", "cal", "Callan Smith", "just_because", "2026-08-28"),
      suggestion("2", "cal", "Callan Smith", "just_because", "2026-08-29"),
      suggestion("3", "cal", "Callan Smith", "just_because", "2026-08-28"),
    ];
    const groups = groupSuggestionsByPersonAndRun(input);
    expect(groups).toHaveLength(1);
    expect(groups[0].runs).toHaveLength(2);
    expect(groups[0].runs[0]).toMatchObject({ occasionType: "just_because", occasionDate: "2026-08-28" });
    expect(groups[0].runs[0].suggestions.map((s) => s.id)).toEqual(["1", "3"]);
    expect(groups[0].runs[1].suggestions.map((s) => s.id)).toEqual(["2"]);
  });

  it("returns an empty array for an empty input", () => {
    expect(groupSuggestionsByPersonAndRun([])).toEqual([]);
  });

  it("matches the real production shape: 8 Callan Smith suggestions across two just_because runs", () => {
    const input = [
      ...Array.from({ length: 5 }, (_, i) => suggestion(`a${i}`, "cal", "Callan Smith", "just_because", "2026-08-28")),
      ...Array.from({ length: 3 }, (_, i) => suggestion(`b${i}`, "cal", "Callan Smith", "just_because", "2026-08-29")),
    ];
    const groups = groupSuggestionsByPersonAndRun(input);
    expect(groups).toHaveLength(1);
    expect(groups[0].runs).toHaveLength(2);
    expect(groups[0].runs[0].suggestions).toHaveLength(5);
    expect(groups[0].runs[1].suggestions).toHaveLength(3);
  });
});
