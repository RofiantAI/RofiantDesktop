import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FolderOpen, FileText, PenLine, TerminalSquare, Wrench, Ban, Copy, Check } from "lucide-react";
import { tokenize, type TokenType } from "./syntax-highlight";

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

const TOKEN_CLASSES: Record<TokenType, string> = {
  keyword: "text-syntax-keyword",
  string: "text-syntax-string",
  comment: "text-syntax-comment italic",
  number: "text-syntax-number",
  function: "text-syntax-function",
  text: "",
};

function HighlightedCode({ lang, code }: { lang: string; code: string }) {
  const tokens = useMemo(() => tokenize(code, lang), [code, lang]);
  return (
    <>
      {tokens.map((token, i) => {
        const className = TOKEN_CLASSES[token.type];
        return className ? (
          <span key={i} className={className}>
            {token.text}
          </span>
        ) : (
          <span key={i}>{token.text}</span>
        );
      })}
    </>
  );
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable, ignore
    }
  }

  return (
    <div className="rounded-lg bg-code-bg border border-code-border my-1.5 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1 border-b border-code-border">
        <span className="text-[0.75em] font-mono text-foreground-muted lowercase">{lang || "code"}</span>
        <button
          type="button"
          onClick={copy}
          title={copied ? "Copied" : "Copy"}
          aria-label={copied ? "Copied" : "Copy code"}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[0.75em] text-foreground-muted hover:text-foreground hover:bg-background-tertiary transition-colors"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="px-3 py-2 overflow-x-auto text-[0.85em] font-mono text-foreground">
        <code>
          <HighlightedCode lang={lang} code={code} />
        </code>
      </pre>
    </div>
  );
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

    const fenceOpen = line.match(/^\s*```(\w*)/);
    if (fenceOpen) {
      flushList(`list-${i}`);
      const fenceKey = i;
      const lang = fenceOpen[1];
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].match(/^\s*```/)) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip the closing fence (or end of text, if unterminated)
      blocks.push(<CodeBlock key={`code-${fenceKey}`} lang={lang} code={codeLines.join("\n")} />);
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
