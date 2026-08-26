// Renders the small, fixed markdown subset our own generators produce
// (lib/brief/render.ts, lib/planner/generate.ts): "## " headline, blank-line
// separated paragraphs, "- " bullet lists, and inline "**bold**" spans. This
// is NOT a general-purpose markdown parser — it is intentionally narrow
// because the only input is our own deterministic renderer output, never
// arbitrary user or AI text (D-048).
import { Fragment } from "react";

function renderInline(text: string, keyPrefix: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter((p) => p.length > 0);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>;
    }
    return <Fragment key={`${keyPrefix}-${i}`}>{part}</Fragment>;
  });
}

export function RenderedMarkdown({ content, className }: { content: string; className?: string }) {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let listBuffer: string[] = [];

  const flushList = () => {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="ml-4 list-disc space-y-0.5">
        {listBuffer.map((item, i) => (
          <li key={i}>{renderInline(item, `li-${blocks.length}-${i}`)}</li>
        ))}
      </ul>
    );
    listBuffer = [];
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (line.length === 0) {
      flushList();
      return;
    }
    if (line.startsWith("## ")) {
      flushList();
      blocks.push(
        <p key={`h-${idx}`} className="font-semibold">
          {renderInline(line.slice(3), `h-${idx}`)}
        </p>
      );
      return;
    }
    if (line.startsWith("- ")) {
      listBuffer.push(line.slice(2));
      return;
    }
    flushList();
    blocks.push(<p key={`p-${idx}`}>{renderInline(line, `p-${idx}`)}</p>);
  });
  flushList();

  return <div className={className}>{blocks}</div>;
}
