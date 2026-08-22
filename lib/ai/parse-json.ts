// Defensive JSON parsing for AI responses (Section 7.3: "Parse defensively.
// Retry once on parse failure, then log and degrade gracefully."). The base
// system prompt instructs no markdown fences, but models don't always
// comply perfectly — this strips the common deviations before giving up.
export interface ParseResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export function parseAiJson<T = unknown>(rawText: string): ParseResult<T> {
  const stripped = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  try {
    return { success: true, data: JSON.parse(stripped) as T };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
