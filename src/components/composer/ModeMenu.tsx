import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Bot,
  Check,
  ChevronDown,
  Hand,
  ShieldCheck,
} from "lucide-react";
import type { Agent, ChatMode } from "../../lib/agents";
import { useConfirmDialog } from "../ConfirmDialog";

export function ModeMenu({
  mode,
  onModeChange,
  agents,
  activeAgentId,
  onAgentChange,
}: {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  agents: Agent[];
  activeAgentId: string | null;
  onAgentChange: (agentId: string | null) => void;
}) {
  const [modeOpen, setModeOpen] = useState(false);
  const modeRef = useRef<HTMLDivElement>(null);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  useEffect(() => {
    if (!modeOpen) return;
    function handleClick(e: MouseEvent) {
      if (modeRef.current && !modeRef.current.contains(e.target as Node)) {
        setModeOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [modeOpen]);

  const activeAgent = agents.find((a) => a.id === activeAgentId) ?? null;
  const modeLabel = activeAgent
    ? activeAgent.name
    : mode === "approve-for-me"
      ? "Approve for me"
      : mode === "full-access"
        ? "Full access"
        : "Ask for approval";
  const ModeIcon = activeAgent
    ? Bot
    : mode === "approve-for-me"
      ? ShieldCheck
      : mode === "full-access"
        ? AlertCircle
        : Hand;

  function choose(next: ChatMode) {
    onModeChange(next);
    onAgentChange(null);
    setModeOpen(false);
  }

  async function chooseFullAccess() {
    setModeOpen(false);
    if (mode === "full-access") return;
    const ok = await confirm({
      title: "Full access?",
      description:
        "The agent will edit any file, run terminal commands, and use the internet without asking you to approve each one first. Only use this if you trust the task you're about to run.",
      confirmLabel: "Allow full access",
      danger: true,
      dontShowAgainKey: "full-access",
    });
    if (!ok) return;
    onModeChange("full-access");
    onAgentChange(null);
  }

  return (
    <div className="relative" ref={modeRef}>
      <button
        type="button"
        onClick={() => setModeOpen((v) => !v)}
        className="flex items-center gap-1 text-[12px] text-foreground-muted hover:text-foreground transition-colors"
      >
        <ModeIcon
          className={`w-3 h-3 ${mode === "full-access" && !activeAgent ? "text-orange-500" : ""}`}
        />
        {modeLabel}
        <ChevronDown className="w-3 h-3" />
      </button>
      {modeOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-56 rounded-lg border border-border bg-card shadow-lg py-1 px-0.5 z-10">
          <button
            type="button"
            onClick={() => choose("ask")}
            className="w-[calc(100%-2px)] mx-px flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-background-tertiary rounded-md"
          >
            <span className="flex items-center gap-2">
              <Hand className="w-3.5 h-3.5 text-foreground-muted" />
              <span>
                <span className="block text-[13px] text-foreground font-medium leading-tight">
                  Ask for approval
                </span>
                <span className="block text-[11px] text-foreground-muted leading-tight">
                  Always ask to edit external files and use the internet
                </span>
              </span>
            </span>
            {mode === "ask" && !activeAgent && (
              <Check className="w-3.5 h-3.5 text-accent-primary shrink-0" />
            )}
          </button>
          <button
            type="button"
            onClick={() => choose("approve-for-me")}
            className="w-[calc(100%-2px)] mx-px flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-background-tertiary rounded-md"
          >
            <span className="flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-foreground-muted" />
              <span>
                <span className="block text-[13px] text-foreground font-medium leading-tight">
                  Approve for me
                </span>
                <span className="block text-[11px] text-foreground-muted leading-tight">
                  Only ask for actions detected as potentially unsafe
                </span>
              </span>
            </span>
            {mode === "approve-for-me" && !activeAgent && (
              <Check className="w-3.5 h-3.5 text-accent-primary shrink-0" />
            )}
          </button>
          <button
            type="button"
            onClick={() => void chooseFullAccess()}
            className="w-[calc(100%-2px)] mx-px flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-background-tertiary rounded-md"
          >
            <span className="flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-foreground-muted" />
              <span>
                <span className="block text-[13px] text-foreground font-medium leading-tight">
                  Full access
                </span>
                <span className="block text-[11px] text-foreground-muted leading-tight">
                  Unrestricted access to the internet and any file on your computer
                </span>
              </span>
            </span>
            {mode === "full-access" && !activeAgent && (
              <Check className="w-3.5 h-3.5 text-accent-primary shrink-0" />
            )}
          </button>
          {agents.length > 0 && (
            <>
              <div className="my-1 border-t border-border" />
              <div className="px-3 pt-1 pb-0.5 text-[10px] font-medium text-foreground-muted uppercase tracking-wide">
                Agents
              </div>
              <div className="max-h-40 overflow-y-auto">
                {agents.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      onAgentChange(a.id);
                      setModeOpen(false);
                    }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-background-tertiary"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Bot className="w-3.5 h-3.5 text-foreground-muted shrink-0" />
                      <span className="text-[13px] text-foreground font-medium truncate">
                        {a.name}
                      </span>
                    </span>
                    {activeAgentId === a.id && (
                      <Check className="w-3.5 h-3.5 text-accent-primary shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
