import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { MessageCircle, Minus, Send, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { loadSettings, resolveTheme } from "../lib/settings";
import { sendChatMessage, type ChatMessage } from "../lib/groq";
import { planFromSession, isProPlan } from "../lib/plan";

// Applies the same theme/style classes App.tsx applies to the main window.
// This is a standalone webview window, so it needs its own copy of that
// bootstrapping; it does not need to stay live-reactive to settings changes
// made elsewhere while the bubble is open.
function applyChromeFromSettings() {
  const settings = loadSettings();
  const resolved = resolveTheme(settings.theme);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.classList.toggle("ui-clay", settings.uiStyle === "clay");
  root.classList.toggle("ui-glass", settings.uiStyle === "glass");
  return settings;
}

export function WidgetBubble() {
  const [expanded, setExpanded] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [model, setModel] = useState(() => loadSettings().model);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const conversationId = useRef(crypto.randomUUID());
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const settings = applyChromeFromSettings();
    setModel(settings.model);
    supabase.auth.getSession().then(({ data }) => {
      setAccessToken(data.session?.access_token ?? null);
      setIsPro(isProPlan(planFromSession(data.session)));
    });
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  async function toggleExpanded(next: boolean) {
    setExpanded(next);
    await invoke("set_widget_expanded", { expanded: next }).catch(() => {});
  }

  async function openMainWindow() {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const main = await WebviewWindow.getByLabel("main");
    await main?.show();
    await main?.setFocus();
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading || !accessToken) return;
    setInput("");
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setLoading(true);
    try {
      await sendChatMessage(
        next,
        model,
        conversationId.current,
        accessToken,
        (delta, replace) => {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            copy[copy.length - 1] = {
              ...last,
              content: replace ? delta : last.content + delta,
            };
            return copy;
          });
        },
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        isPro,
      );
    } catch (err) {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
        };
        return copy;
      });
    } finally {
      setLoading(false);
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => void toggleExpanded(true)}
        className="w-full h-full flex items-center justify-center rounded-full bg-foreground text-background hover:brightness-95 active:brightness-90 transition-[filter] cursor-pointer"
        title="Open Rofiant"
      >
        <MessageCircle className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div className="w-full h-full flex flex-col rounded-2xl overflow-hidden border border-border bg-card shadow-clay">
      <div
        data-tauri-drag-region
        className="flex items-center justify-between h-9 px-3 border-b border-border shrink-0"
      >
        <span className="text-[12px] font-medium text-foreground">Rofiant</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void openMainWindow()}
            className="p-1 rounded hover:bg-background-tertiary text-foreground-secondary hover:text-foreground"
            title="Open full app"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void toggleExpanded(false)}
            className="p-1 rounded hover:bg-background-tertiary text-foreground-secondary hover:text-foreground"
            title="Collapse"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-2 min-h-0">
        {!accessToken ? (
          <div className="m-auto text-center text-[12px] text-foreground-muted px-4">
            Sign in from the main app to chat here.
          </div>
        ) : messages.length === 0 ? (
          <div className="m-auto text-center text-[12px] text-foreground-muted px-4">
            Quick chat with Rofiant — messages here aren't saved to your history.
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={`text-[13px] leading-snug px-2.5 py-1.5 rounded-lg whitespace-pre-wrap break-words ${
                m.role === "user"
                  ? "self-end bg-accent-primary text-white max-w-[85%]"
                  : "self-start bg-background-tertiary text-foreground max-w-[85%]"
              }`}
            >
              {m.content || (loading && i === messages.length - 1 ? <Loader2 className="w-3 h-3 animate-spin" /> : "")}
            </div>
          ))
        )}
      </div>

      <div className="flex items-center gap-1.5 p-2 border-t border-border shrink-0">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          disabled={!accessToken}
          placeholder="Message Rofiant…"
          className="flex-1 h-8 px-2.5 rounded-lg bg-background-tertiary border border-border text-[13px] text-foreground placeholder:text-foreground-muted outline-none focus:border-border-light disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={!accessToken || loading || !input.trim()}
          className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg bg-foreground text-background disabled:opacity-40 hover:brightness-95 transition-[filter]"
          title="Send"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}
