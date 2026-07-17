import { memo, useState } from "react";
import { Check, Copy } from "lucide-react";
import type { Message } from "../types";
import { MarkdownLite } from "../lib/markdown-lite";

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-foreground leading-relaxed shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          {message.imageDataUrl && (
            <img
              src={message.imageDataUrl}
              alt="Attached image"
              className="mb-2 max-w-[280px] max-h-[280px] rounded-lg border border-border object-cover"
            />
          )}
          {message.content}
        </div>
        <div className="flex items-center gap-2 mt-1 px-0.5">
          {showTimestamp && (
            <div className="text-[11px] text-foreground-muted">{formatTime(message.createdAt)}</div>
          )}
          <CopyButton text={message.content} />
        </div>
      </div>
    );
  }

  return (
    <div className="text-foreground leading-relaxed">
      {message.content ? (
        <>
          <MarkdownLite text={message.content} />
          <div className="flex items-center gap-2 mt-1">
            {showTimestamp && (
              <div className="text-[11px] text-foreground-muted">{formatTime(message.createdAt)}</div>
            )}
            <CopyButton text={message.content} />
          </div>
        </>
      ) : (
        <span className="inline-flex gap-1 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-foreground-muted animate-bounce [animation-delay:-0.3s]" />
          <span className="w-1.5 h-1.5 rounded-full bg-foreground-muted animate-bounce [animation-delay:-0.15s]" />
          <span className="w-1.5 h-1.5 rounded-full bg-foreground-muted animate-bounce" />
        </span>
      )}
    </div>
  );
});
