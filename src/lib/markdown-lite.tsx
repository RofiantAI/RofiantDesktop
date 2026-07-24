import { memo, type ReactNode } from "react";
import { FolderOpen, FileText, PenLine, TerminalSquare, Wrench, Ban } from "lucide-react";

const TOOL_ICONS: Record<string, typeof Wrench> = {
  list_directory: FolderOpen,
  read_file: FileText,
  write_file: PenLine,
  run_command: TerminalSquare,
  rejected: Ban,
};

const TOOL_TAG = /^@@tool:([a-zA-Z0-9_]+)@@(.*)$/;

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
};

// Small models occasionally emit literal HTML entities instead of the
// character they mean — decode the common ones so they don't leak into view.
function decodeEntities(text: string): string {
  return text.replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/g, (m, name) => ENTITIES[name] ?? m);
}

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 rounded bg-code-bg border border-code-border text-[0.85em] font-mono text-foreground break-all"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export const MarkdownLite = memo(function MarkdownLite({ text }: { text: string }) {
  const lines = decodeEntities(text).split("\n");
  const blocks: ReactNode[] = [];
  let listBuffer: string[] = [];

  const flushList = (key: string) => {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul key={key} className="list-disc pl-5 space-y-1 my-1.5">
        {listBuffer.map((item, i) => (
          <li key={i} className="leading-relaxed break-words">
            {renderInline(item)}
          </li>
        ))}
      </ul>,
    );
    listBuffer = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.match(/^\s*```/)) {
      flushList(`list-${i}`);
      const fenceKey = i;
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].match(/^\s*```/)) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip the closing fence (or end of text, if unterminated)
      blocks.push(
        <pre
          key={`code-${fenceKey}`}
          className="rounded-lg bg-code-bg border border-code-border px-3 py-2 my-1.5 overflow-x-auto text-[0.85em] font-mono text-foreground"
        >
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const toolTag = line.match(TOOL_TAG);
    if (toolTag) {
      flushList(`list-${i}`);
      const Icon = TOOL_ICONS[toolTag[1]] ?? Wrench;
      blocks.push(
        <p key={i} className="leading-relaxed flex items-center gap-1.5 break-words min-w-0">
          <Icon className="w-3.5 h-3.5 text-foreground-muted shrink-0" />
          {renderInline(toolTag[2])}
        </p>,
      );
      i++;
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)/);
    const heading = line.match(/^(#{1,3})\s+(.*)/);

    if (bullet) {
      listBuffer.push(bullet[1]);
      i++;
      continue;
    }
    flushList(`list-${i}`);

    if (heading) {
      const level = heading[1].length;
      const className =
        level === 1
          ? "text-lg font-semibold mt-3 mb-1"
          : level === 2
            ? "text-base font-semibold mt-3 mb-1"
            : "text-sm font-semibold mt-2 mb-1";
      blocks.push(
        <div key={i} className={`${className} break-words`}>
          {renderInline(heading[2])}
        </div>,
      );
      i++;
      continue;
    }

    if (line.trim() === "") {
      blocks.push(<div key={i} className="h-2" />);
      i++;
      continue;
    }

    blocks.push(
      <p key={i} className="leading-relaxed break-words">
        {renderInline(line)}
      </p>,
    );
    i++;
  }
  flushList("list-end");

  return <div>{blocks}</div>;
});
