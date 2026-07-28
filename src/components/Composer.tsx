import { useEffect, useRef, useState } from "react";
import { ArrowUp, Plus, X, Terminal, Square, Mic, Loader2 } from "lucide-react";
import { isVisionModel, VISION_MODEL_ID } from "../lib/models";
import type { CustomProvider } from "../lib/providers";
import { readImageFile } from "../lib/image";
import { SLASH_COMMANDS } from "../lib/commands";
import { useVoiceRecording } from "../lib/useVoiceRecording";
import type { SendKey } from "../lib/settings";
import type { Agent, ChatMode } from "../lib/agents";
import { ModeMenu } from "./composer/ModeMenu";
import { ModelPicker } from "./composer/ModelPicker";

export function Composer({
  disabled,
  isRunning,
  onSend,
  onStop,
  model,
  isPro,
  onModelChange,
  onSelectLocalModel,
  spellcheck,
  sendKey,
  accessToken,
  customProviders,
  mode,
  onModeChange,
  agents,
  activeAgentId,
  onAgentChange,
}: {
  disabled: boolean;
  isRunning: boolean;
  onSend: (text: string, imageDataUrl?: string) => void;
  onStop: () => void;
  model: string;
  isPro: boolean;
  onModelChange: (id: string) => void;
  onSelectLocalModel: (modelId: string) => void;
  spellcheck: boolean;
  sendKey: SendKey;
  accessToken: string | null;
  customProviders: CustomProvider[];
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  agents: Agent[];
  activeAgentId: string | null;
  onAgentChange: (agentId: string | null) => void;
}) {
  const [value, setValue] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [commandIndex, setCommandIndex] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { isRecording, isTranscribing, voiceError, setVoiceError, toggleRecording } = useVoiceRecording(
    accessToken,
    (text) => {
      setValue((v) => (v ? `${v} ${text}` : text));
      ref.current?.focus();
    },
  );

  const commandMatches = value.startsWith("/")
    ? SLASH_COMMANDS.filter((c) => c.cmd.toLowerCase().startsWith(value.toLowerCase()))
    : [];
  const showCommandMenu = commandMatches.length > 0 && !(commandMatches.length === 1 && commandMatches[0].cmd === value);

  useEffect(() => {
    setCommandIndex(0);
  }, [value]);

  function applyCommand(cmd: string) {
    const next = `${cmd} `;
    setValue(next);
    ref.current?.focus();
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
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    e.preventDefault();
    void attachFile(file);
  }

  function submit() {
    const trimmed = value.trim();
    if ((!trimmed && !image) || disabled) return;
    onSend(trimmed, image ?? undefined);
    setValue("");
    setImage(null);
    setAttachError(null);
    if (ref.current) ref.current.style.height = "auto";
  }

  function selectModel(id: string) {
    onModelChange(id);
    if (image && !isVisionModel(id)) setImage(null);
  }

  function selectLocalModel(id: string) {
    onSelectLocalModel(id);
    if (image) setImage(null);
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
                  i === commandIndex ? "bg-background-tertiary" : "hover:bg-background-tertiary"
                }`}
              >
                <Terminal className="w-3.5 h-3.5 text-foreground-muted shrink-0" />
                <span className="text-[13px] text-foreground font-medium">{c.cmd}</span>
                <span className="text-[11px] text-foreground-muted truncate">{c.desc}</span>
              </button>
            ))}
          </div>
        )}
      <div className="rounded-2xl border border-border bg-card shadow-[0_2px_8px_rgba(0,0,0,0.06)] focus-within:border-border-light transition-colors">
        {image && (
          <div className="flex items-center gap-2 px-3 pt-2.5">
            <div className="relative shrink-0">
              <img src={image} alt="Attached" className="w-10 h-10 rounded-md object-cover border border-border" />
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
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center w-6 h-6 rounded-md text-foreground-muted hover:text-foreground hover:bg-background-tertiary transition-colors shrink-0"
            title="Attach"
            aria-label="Attach image"
          >
            <Plus className="w-4 h-4" />
          </button>
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
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
                  setCommandIndex((i) => (i - 1 + commandMatches.length) % commandMatches.length);
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
              }
              const isEnter = e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter";
              if (!isEnter || e.nativeEvent.isComposing || e.shiftKey) return;
              const mod = e.metaKey || e.ctrlKey;
              if (sendKey === "mod-enter" ? !mod : mod) return;
              e.preventDefault();
              submit();
            }}
            onPaste={handlePaste}
            spellCheck={spellcheck}
            rows={1}
            placeholder="Ask anything..."
            className="flex-1 resize-none bg-transparent text-[14px] text-foreground placeholder:text-foreground-muted outline-none py-1 max-h-40"
          />
        </div>
        <div className="flex items-center justify-between px-3 pb-2 pt-1">
          <div className="flex items-center gap-3 min-w-0">
            <ModeMenu
              mode={mode}
              onModeChange={onModeChange}
              agents={agents}
              activeAgentId={activeAgentId}
              onAgentChange={onAgentChange}
            />
            <ModelPicker
              model={model}
              isPro={isPro}
              customProviders={customProviders}
              onSelectModel={selectModel}
              onSelectLocalModel={selectLocalModel}
            />
          </div>
          {isRunning ? (
            <button
              type="button"
              onClick={onStop}
              title="Stop generating"
              aria-label="Stop generating"
              className="flex items-center justify-center w-6 h-6 rounded-full bg-foreground text-background transition-colors shrink-0"
            >
              <Square className="w-2.5 h-2.5 fill-current" />
            </button>
          ) : isRecording || (!value.trim() && !image) ? (
            <button
              type="button"
              onClick={toggleRecording}
              disabled={isTranscribing}
              title={isRecording ? "Stop recording" : "Speak"}
              aria-label={isRecording ? "Stop recording" : "Speak"}
              className={`flex items-center justify-center w-6 h-6 rounded-full transition-colors shrink-0 ${
                isRecording
                  ? "text-red-500 bg-red-500/10 animate-pulse"
                  : "bg-foreground text-background disabled:bg-background-tertiary disabled:text-foreground-muted"
              }`}
            >
              {isTranscribing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Mic className="w-3.5 h-3.5" />
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={disabled}
              title="Send"
              aria-label="Send message"
              className="flex items-center justify-center w-6 h-6 rounded-full bg-foreground text-background disabled:bg-background-tertiary disabled:text-foreground-muted transition-colors shrink-0"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      <p className="text-center text-[11px] text-foreground-muted mt-2">
        AI can make mistakes. Double-check important responses.
      </p>
      </div>
    </div>
  );
}
