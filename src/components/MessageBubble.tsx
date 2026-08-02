import { memo, useState } from "react";
import { Check, Copy } from "lucide-react";
import type { Message } from "../types";
import { MarkdownLite } from "../lib/markdown-lite";

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number) {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable, ignore
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? "Copied" : "Copy"}
      aria-label={copied ? "Copied" : "Copy message"}
      className="flex items-center justify-center w-6 h-6 rounded-md text-foreground-muted hover:text-foreground hover:bg-background-tertiary transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

export const MessageBubble = memo(function MessageBubble({
  message,
  showTimestamp,
}: {
  message: Message;
  showTimestamp?: boolean;
}) {
  if (message.role === "user") {
    return (
      <div>
        <div className="flex justify-end">
          <div className="max-w-[85%] sm:max-w-[70%] rounded-md border border-border bg-card px-3 py-2 text-foreground leading-relaxed shadow-[0_1px_2px_rgba(0,0,0,0.04)] break-words">
            {message.imageDataUrl && (
              <img
                src={message.imageDataUrl}
                alt="Attached image"
                className="mb-2 max-w-[280px] max-h-[280px] rounded-lg border border-border object-cover"
              />
            )}
            {message.content}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-1 px-0.5">
          {showTimestamp && (
            <div className="text-[11px] text-foreground-muted">
              {formatTime(message.createdAt)}
            </div>
          )}
          <CopyButton text={message.content} />
        </div>
      </div>
    );
  }

  if (!message.content) return null;

  return (
    <div className="text-foreground leading-relaxed break-words">
      <MarkdownLite text={message.content} />
      <div className="flex items-center gap-2 mt-1">
        {showTimestamp && (
          <div className="text-[11px] text-foreground-muted">
            {formatTime(message.createdAt)}
            {message.durationMs != null &&
              ` · ${formatDuration(message.durationMs)}`}
          </div>
        )}
        <CopyButton text={message.content} />
      </div>
    </div>
  );
});
