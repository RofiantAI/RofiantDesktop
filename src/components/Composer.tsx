import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  X,
  Terminal,
  Square,
  Mic,
  Loader2,
  Paperclip,
  Command,
  User,
  MessageSquare,
  File as FileIcon,
  Folder as FolderIcon,
} from "lucide-react";
import {
  contextWindowForModel,
  isVisionModel,
  VISION_MODEL_ID,
} from "../lib/models";
import type { EffortLevel } from "../lib/models";
import type { CustomProvider } from "../lib/providers";
import { readImageFile } from "../lib/image";
import { SLASH_COMMANDS } from "../lib/commands";
import { useVoiceRecording } from "../lib/useVoiceRecording";
import type { SendKey } from "../lib/settings";
import type { Agent, ChatMode } from "../lib/agents";
import type { Conversation } from "../types";
import {
  findMentionTrigger,
  matchAgents,
  matchConversations,
  listMentionFiles,
  filterFilesByName,
  readMentionFile,
  mentionToken,
} from "../lib/mentions";
import type { MentionItem, MentionMatch } from "../lib/mentions";
import { ModelPicker } from "./composer/ModelPicker";
import { EffortMenu } from "./composer/EffortMenu";
import { ModeMenu } from "./composer/ModeMenu";

function ContextRing({
  model,
  usage,
}: {
  model: string;
  usage?: { inputTokens: number; outputTokens: number } | null;
}) {
  const max = contextWindowForModel(model);
  const used = usage ? usage.inputTokens + usage.outputTokens : 0;
  const pct = Math.min(100, (used / max) * 100);
  const radius = 6;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);
  const label = `${Math.round(pct)}% context used`;
  const ringColorClass = !usage
    ? "text-foreground-muted"
    : pct < 60
      ? "text-accent-success"
      : pct < 85
        ? "text-accent-warning"
        : "text-accent-orange";

  return (
    <div
      aria-label={`${label}, ${used.toLocaleString()} of ${max.toLocaleString()} tokens`}
      className={`group relative flex items-center justify-center w-6 h-6 shrink-0 transition-colors ${ringColorClass}`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" className="-rotate-90">
        <circle
          cx="8"
          cy="8"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="2"
        />
        <circle
          cx="8"
          cy="8"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-300"
        />
      </svg>
      <div
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 opacity-0 translate-y-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0 z-20"
      >
        <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg whitespace-nowrap">
          <div className="flex items-center gap-2">
            <span className={`text-[13px] font-semibold ${ringColorClass}`}>
              {Math.round(pct)}%
            </span>
            <span className="text-[12px] text-foreground">context used</span>
          </div>
          <div className="text-[11px] text-foreground-muted mt-0.5">
            {used.toLocaleString()} / {max.toLocaleString()} tokens
          </div>
        </div>
        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-[5px] w-2.5 h-2.5 rotate-45 rounded-[2px] bg-card border-r border-b border-border" />
      </div>
    </div>
  );
}

export function Composer({
  disabled,
  isRunning,
  onSend,
  onStop,
  model,
  isPro,
  onModelChange,
  effort,
  onEffortChange,
  spellcheck,
  sendKey,
  accessToken,
  customProviders,
  mode,
  onModeChange,
  agents,
  activeAgentId,
  onAgentChange,
  contextUsage,
  conversations,
  currentConversationId,
}: {
  disabled: boolean;
  isRunning: boolean;
  onSend: (text: string, imageDataUrl?: string) => void;
  onStop: () => void;
  model: string;
  isPro: boolean;
  onModelChange: (id: string) => void;
  effort: EffortLevel;
  onEffortChange: (effort: EffortLevel) => void;
  spellcheck: boolean;
  sendKey: SendKey;
  accessToken: string | null;
  customProviders: CustomProvider[];
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  agents: Agent[];
  activeAgentId: string | null;
  onAgentChange: (agentId: string | null) => void;
  contextUsage?: { inputTokens: number; outputTokens: number } | null;
  conversations: Conversation[];
  currentConversationId: string | null;
}) {
  const [value, setValue] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [commandIndex, setCommandIndex] = useState(0);
  const [mentionMatch, setMentionMatch] = useState<MentionMatch | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [fileListing, setFileListing] = useState<MentionItem[]>([]);
  const [selectedMentions, setSelectedMentions] = useState<
    { token: string; item: MentionItem }[]
  >([]);
  const [resolvingMentions, setResolvingMentions] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    isRecording,
    isTranscribing,
    voiceError,
    setVoiceError,
    toggleRecording,
  } = useVoiceRecording(accessToken, (text) => {
    setValue((v) => (v ? `${v} ${text}` : text));
    ref.current?.focus();
  });

  const commandMatches = value.startsWith("/")
    ? SLASH_COMMANDS.filter((c) =>
        c.cmd.toLowerCase().startsWith(value.toLowerCase()),
      )
    : [];
  const showCommandMenu =
    commandMatches.length > 0 &&
    !(commandMatches.length === 1 && commandMatches[0].cmd === value);

  useEffect(() => {
    setCommandIndex(0);
  }, [value]);

  function applyCommand(cmd: string) {
    const next = `${cmd} `;
    setValue(next);
    ref.current?.focus();
  }

  const mentionQuery = mentionMatch?.query ?? "";
  const mentionSlashIndex = mentionQuery.lastIndexOf("/");
  const mentionDirPath =
    mentionSlashIndex === -1 ? "" : mentionQuery.slice(0, mentionSlashIndex);
  const mentionFilterText =
    mentionSlashIndex === -1
      ? mentionQuery
      : mentionQuery.slice(mentionSlashIndex + 1);
  const isFileBrowse = mentionSlashIndex !== -1;

  const mentionAgentItems =
    mentionMatch && !isFileBrowse
      ? matchAgents(agents, mentionFilterText).slice(0, 5)
      : [];
  const mentionConversationItems =
    mentionMatch && !isFileBrowse
      ? matchConversations(
          conversations,
          mentionFilterText,
          currentConversationId ?? undefined,
        ).slice(0, 5)
      : [];
  const mentionFileItems = mentionMatch
    ? filterFilesByName(fileListing, mentionFilterText).slice(0, 8)
    : [];
  const mentionSections = [
    { title: "Agents", items: mentionAgentItems },
    { title: "Conversations", items: mentionConversationItems },
    { title: "Files", items: mentionFileItems },
  ].filter((s) => s.items.length > 0);
  const mentionItems = mentionSections.flatMap((s) => s.items);
  const showMentionMenu = mentionMatch !== null && mentionItems.length > 0;

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionQuery]);

  useEffect(() => {
    if (!mentionMatch) return;
    let cancelled = false;
    listMentionFiles(mentionDirPath || undefined).then((items) => {
      if (!cancelled) setFileListing(items);
    });
    return () => {
      cancelled = true;
    };
    // Re-list only when the mention menu opens or the browsed subdirectory
    // changes — not on every keystroke of the filter text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentionMatch !== null, mentionDirPath]);

  function refreshMentionMatch(el: HTMLTextAreaElement) {
    setMentionMatch(
      findMentionTrigger(el.value, el.selectionStart ?? el.value.length),
    );
  }

  function selectMentionItem(item: MentionItem) {
    if (!mentionMatch) return;
    if (item.kind === "file" && item.isDir) {
      const newQuery = `${item.path}/`;
      const before = value.slice(0, mentionMatch.start + 1);
      const after = value.slice(
        mentionMatch.start + 1 + mentionMatch.query.length,
      );
      const next = `${before}${newQuery}${after}`;
      setValue(next);
      setMentionMatch({ start: mentionMatch.start, query: newQuery });
      requestAnimationFrame(() => {
        const pos = before.length + newQuery.length;
        ref.current?.focus();
        ref.current?.setSelectionRange(pos, pos);
      });
      return;
    }

    const token = mentionToken(item);
    const before = value.slice(0, mentionMatch.start);
    const after = value.slice(
      mentionMatch.start + 1 + mentionMatch.query.length,
    );
    const next = `${before}${token} ${after}`;
    setValue(next);
    setSelectedMentions((prev) => [
      ...prev.filter((m) => m.token !== token),
      { token, item },
    ]);
    setMentionMatch(null);
    if (item.kind === "agent") onAgentChange(item.id);
    requestAnimationFrame(() => {
      const pos = before.length + token.length + 1;
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    });
  }

  async function attachFile(file: File) {
    const result = await readImageFile(file);
    if (!result.ok) {
      setAttachError(result.error);
      return;
    }
    setAttachError(null);
    setImage(result.dataUrl);
    if (!isVisionModel(model)) onModelChange(VISION_MODEL_ID);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void attachFile(file);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const item = Array.from(e.clipboardData.items).find((i) =>
      i.type.startsWith("image/"),
    );
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    e.preventDefault();
    void attachFile(file);
  }

  async function submit() {
    const trimmed = value.trim();
    if ((!trimmed && !image) || disabled || resolvingMentions) return;

    const activeMentions = selectedMentions.filter((m) =>
      value.includes(m.token),
    );
    let finalText = trimmed;
    if (activeMentions.length > 0) {
      setResolvingMentions(true);
      try {
        const blocks: string[] = [];
        for (const { item } of activeMentions) {
          if (item.kind === "file" && item.path) {
            try {
              const content = await readMentionFile(item.path);
              blocks.push(`--- @${item.label} (${item.path}) ---\n${content}`);
            } catch {
              // File may have moved or been deleted since it was mentioned; skip it.
            }
          } else if (item.kind === "conversation") {
            const conv = conversations.find((c) => c.id === item.id);
            if (conv) {
              const transcript = conv.messages
                .slice(-10)
                .map((m) => `${m.role}: ${m.content}`)
                .join("\n");
              blocks.push(
                `--- Referenced conversation "${conv.title}" ---\n${transcript}`,
              );
            }
          }
        }
        if (blocks.length > 0) {
          finalText = `${trimmed}\n\n${blocks.join("\n\n")}`;
        }
      } finally {
        setResolvingMentions(false);
      }
    }

    onSend(finalText, image ?? undefined);
    setValue("");
    setImage(null);
    setAttachError(null);
    setSelectedMentions([]);
    setMentionMatch(null);
    if (ref.current) ref.current.style.height = "auto";
  }

  function selectModel(id: string) {
    onModelChange(id);
    if (image && !isVisionModel(id)) setImage(null);
  }

  return (
    <div className="shrink-0 px-6 pb-5 pt-1">
      <div className="max-w-[720px] mx-auto relative">
        {showCommandMenu && (
          <div className="absolute bottom-full left-0 mb-2 w-full rounded-lg border border-border bg-card shadow-lg py-1 z-10 overflow-hidden">
            {commandMatches.map((c, i) => (
              <button
                key={c.cmd}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyCommand(c.cmd)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                  i === commandIndex
                    ? "bg-background-tertiary"
                    : "hover:bg-background-tertiary"
                }`}
              >
                <Terminal className="w-3.5 h-3.5 text-foreground-muted shrink-0" />
                <span className="text-[13px] text-foreground font-medium">
                  {c.cmd}
                </span>
                <span className="text-[11px] text-foreground-muted truncate">
                  {c.desc}
                </span>
              </button>
            ))}
          </div>
        )}
        {!showCommandMenu &&
          showMentionMenu &&
          (() => {
            let flatIndex = -1;
            return (
              <div className="absolute bottom-full left-0 mb-2 w-full max-w-sm rounded-lg border border-border bg-card shadow-lg py-1 z-10 max-h-64 overflow-y-auto">
                {mentionSections.map((section) => (
                  <div key={section.title}>
                    <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
                      {section.title}
                    </div>
                    {section.items.map((item) => {
                      flatIndex += 1;
                      const idx = flatIndex;
                      return (
                        <button
                          key={`${item.kind}-${item.id}`}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectMentionItem(item)}
                          className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                            idx === mentionIndex
                              ? "bg-background-tertiary"
                              : "hover:bg-background-tertiary"
                          }`}
                        >
                          {item.kind === "agent" && (
                            <User className="w-3.5 h-3.5 text-foreground-muted shrink-0" />
                          )}
                          {item.kind === "conversation" && (
                            <MessageSquare className="w-3.5 h-3.5 text-foreground-muted shrink-0" />
                          )}
                          {item.kind === "file" &&
                            (item.isDir ? (
                              <FolderIcon className="w-3.5 h-3.5 text-foreground-muted shrink-0" />
                            ) : (
                              <FileIcon className="w-3.5 h-3.5 text-foreground-muted shrink-0" />
                            ))}
                          <span className="text-[13px] text-foreground font-medium truncate">
                            {item.label}
                          </span>
                          <span className="text-[11px] text-foreground-muted truncate">
                            {item.sublabel}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })()}
        <div className="rounded-xl border border-border bg-card focus-within:border-border-light transition-colors relative">
          {!value && (
            <div className="pointer-events-none absolute top-2 right-3 flex items-center gap-0.5 text-[11px] text-foreground-muted">
              <Command className="w-3 h-3" />
              <span>L to focus</span>
            </div>
          )}
          {image && (
            <div className="flex items-center gap-2 px-3 pt-2.5">
              <div className="relative shrink-0">
                <img
                  src={image}
                  alt="Attached"
                  className="w-10 h-10 rounded-md object-cover border border-border"
                />
                <button
                  type="button"
                  onClick={() => setImage(null)}
                  title="Remove image"
                  aria-label="Remove image"
                  className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-4 h-4 rounded-full bg-foreground text-background"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            </div>
          )}
          {attachError && (
            <div className="flex items-center justify-between gap-2 px-3 pt-2 text-[11px] text-red-500">
              <span>{attachError}</span>
              <button
                type="button"
                onClick={() => setAttachError(null)}
                title="Dismiss"
                aria-label="Dismiss attachment error"
                className="shrink-0 text-red-500/70 hover:text-red-500"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          {voiceError && (
            <div className="flex items-center justify-between gap-2 px-3 pt-2 text-[11px] text-red-500">
              <span>{voiceError}</span>
              <button
                type="button"
                onClick={() => setVoiceError(null)}
                title="Dismiss"
                aria-label="Dismiss voice error"
                className="shrink-0 text-red-500/70 hover:text-red-500"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2 px-3 pt-2.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <textarea
              id="composer-input"
              ref={ref}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                refreshMentionMatch(e.target);
              }}
              onClick={(e) => refreshMentionMatch(e.currentTarget)}
              onKeyUp={(e) => {
                if (
                  ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                ) {
                  refreshMentionMatch(e.currentTarget);
                }
              }}
              onKeyDown={(e) => {
                if (showCommandMenu) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setCommandIndex((i) => (i + 1) % commandMatches.length);
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setCommandIndex(
                      (i) =>
                        (i - 1 + commandMatches.length) % commandMatches.length,
                    );
                    return;
                  }
                  if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
                    e.preventDefault();
                    applyCommand(commandMatches[commandIndex].cmd);
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setValue("");
                    return;
                  }
                } else if (showMentionMenu) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setMentionIndex((i) => (i + 1) % mentionItems.length);
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setMentionIndex(
                      (i) =>
                        (i - 1 + mentionItems.length) % mentionItems.length,
                    );
                    return;
                  }
                  if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
                    e.preventDefault();
                    selectMentionItem(mentionItems[mentionIndex]);
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setMentionMatch(null);
                    return;
                  }
                }
                const isEnter =
                  e.key === "Enter" ||
                  e.code === "Enter" ||
                  e.code === "NumpadEnter";
                if (!isEnter || e.nativeEvent.isComposing || e.shiftKey) return;
                const mod = e.metaKey || e.ctrlKey;
                if (sendKey === "mod-enter" ? !mod : mod) return;
                e.preventDefault();
                void submit();
              }}
              onPaste={handlePaste}
              spellCheck={spellcheck}
              rows={1}
              placeholder="Ask anything, @ to mention, type / for commands"
              className="flex-1 resize-none bg-transparent text-[14px] text-foreground placeholder:text-foreground-muted outline-none py-1 indent-[2px] max-h-40"
            />
          </div>
          <div className="flex items-center justify-between px-3 pb-2 pt-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <ModelPicker
                model={model}
                isPro={isPro}
                customProviders={customProviders}
                onSelectModel={selectModel}
              />
              <EffortMenu
                effort={effort}
                onEffortChange={onEffortChange}
                model={model}
              />
              <ModeMenu
                mode={mode}
                onModeChange={onModeChange}
                agents={agents}
                activeAgentId={activeAgentId}
                onAgentChange={onAgentChange}
              />
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <ContextRing model={model} usage={contextUsage} />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center w-6 h-6 rounded-sm text-foreground-muted hover:text-foreground hover:bg-background-tertiary transition-colors shrink-0"
                title="Attach"
                aria-label="Attach image"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={toggleRecording}
                disabled={isTranscribing}
                title={isRecording ? "Stop recording" : "Speak"}
                aria-label={isRecording ? "Stop recording" : "Speak"}
                className={`flex items-center justify-center w-6 h-6 rounded-sm transition-colors shrink-0 ${
                  isRecording
                    ? "text-red-500 bg-red-500/10 animate-pulse"
                    : "text-foreground-muted hover:text-foreground hover:bg-background-tertiary disabled:text-foreground-muted"
                }`}
              >
                {isTranscribing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Mic className="w-3.5 h-3.5" />
                )}
              </button>
              {isRunning ? (
                <button
                  type="button"
                  onClick={onStop}
                  title="Stop generating"
                  aria-label="Stop generating"
                  className="flex items-center justify-center w-6 h-6 rounded-sm bg-foreground text-background transition-colors shrink-0"
                >
                  <Square className="w-2.5 h-2.5 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={
                    disabled ||
                    isRecording ||
                    isTranscribing ||
                    resolvingMentions ||
                    (!value.trim() && !image)
                  }
                  title="Send"
                  aria-label="Send message"
                  className="flex items-center justify-center w-6 h-6 rounded-sm bg-foreground text-background disabled:bg-background-tertiary disabled:text-foreground-muted transition-colors shrink-0"
                >
                  {resolvingMentions ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ArrowUp className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
        <p className="text-center text-[11px] text-foreground-muted mt-2">
          AI can make mistakes. Double-check important responses.
        </p>
      </div>
    </div>
  );
}
