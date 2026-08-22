// Renders brief content_json to markdown (Section 8.3). Pure, deterministic
// — the AI is never trusted to produce final rendered text.
import type { BriefContent } from "./schema";

export function renderBriefMarkdown(content: BriefContent): string {
  const lines: string[] = [];

  lines.push(`## ${content.headline}`);

  if (content.today.length > 0) {
    lines.push("", "**Today:**");
    for (const item of content.today) {
      const prefix = item.time ? `${item.time} — ` : "";
      const suffix = item.note ? ` (${item.note})` : "";
      lines.push(`- ${prefix}${item.title}${suffix}`);
    }
  }

  if (content.headsUp.length > 0) {
    lines.push("", "**Heads up:**");
    for (const item of content.headsUp) {
      lines.push(`- **${item.title}** — ${item.detail}`);
    }
  }

  if (content.people.length > 0) {
    lines.push("", "**People:**");
    for (const item of content.people) {
      lines.push(`- ${item.personLabel}: ${item.reason}`);
    }
  }

  if (content.suggestion) {
    lines.push("", `**Suggestion:** ${content.suggestion.title} — ${content.suggestion.detail}`);
  }

  if (content.weather) {
    const parts: string[] = [content.weather.summary];
    const range: string[] = [];
    if (content.weather.highF != null) range.push(`High ${Math.round(content.weather.highF)}°F`);
    if (content.weather.lowF != null) range.push(`Low ${Math.round(content.weather.lowF)}°F`);
    if (range.length > 0) parts.push(`(${range.join(", ")})`);
    lines.push("", `**Weather:** ${parts.join(" ")}`);
  }

  return lines.join("\n");
}
