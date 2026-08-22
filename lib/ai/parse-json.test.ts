import { describe, expect, it } from "vitest";
import { parseAiJson } from "./parse-json";

describe("parseAiJson", () => {
  it("parses clean JSON", () => {
    const result = parseAiJson('{"a": 1}');
    expect(result).toEqual({ success: true, data: { a: 1 } });
  });

  it("strips a ```json fence the model added despite instructions", () => {
    const result = parseAiJson('```json\n{"a": 1}\n```');
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ a: 1 });
  });

  it("strips a bare ``` fence", () => {
    const result = parseAiJson("```\n[1,2,3]\n```");
    expect(result.success).toBe(true);
    expect(result.data).toEqual([1, 2, 3]);
  });

  it("trims surrounding whitespace", () => {
    const result = parseAiJson('   \n {"a": 1} \n  ');
    expect(result.success).toBe(true);
  });

  it("reports failure with a message for genuinely broken JSON", () => {
    const result = parseAiJson("not json at all {{{");
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.data).toBeUndefined();
  });
});
